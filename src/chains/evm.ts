import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, formatEther, http, type Address, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, baseSepolia, sepolia } from 'viem/chains';
import contracts from './contracts.json';
const artifact = contracts.PlaygroundNFT;
import { endpoint, env, get, MAINNET, set, type Nft } from '../settings';

export const chains: Record<string, Chain> = MAINNET ? { arbitrum } : { baseSepolia, sepolia };
export const account = privateKeyToAccount(env.VITE_EVM_KEY as `0x${string}`);
export const address = account.address;
const abi = artifact.abi;

/** The selected chain; a stale pick no longer in `chains` (e.g. mainnet Base) falls back to the default. */
export const chainKey = () => { const k = get('evm.chain'); return k in chains ? k : MAINNET ? 'arbitrum' : 'baseSepolia'; };
const chain = () => chains[chainKey()];
/** Per-chain RPC from .env: VITE_EVM_RPC_BASESEPOLIA, VITE_EVM_RPC_SEPOLIA, VITE_EVM_RPC_ARBITRUM_MAINNET. */
export const rpcUrl = (key = chainKey()) => endpoint(`EVM_RPC_${key.toUpperCase()}`);
/** `key` reads another chain (the funding overview). */
const pub = (key = chainKey()) => createPublicClient({ chain: chains[key], transport: http(rpcUrl(key)) });
const wal = (key = chainKey()) => createWalletClient({ account, chain: chains[key], transport: http(rpcUrl(key)) });
export const explorer = () => `${chain().blockExplorers?.default.url}/address/${address}`;

export const contract = () => get(`evm.contract.${chainKey()}`) as Address | '';

export async function balance(key = chainKey()) { return `${formatEther(await pub(key).getBalance({ address }))} ETH`; }

export async function deploy() {
  const hash = await wal().deployContract({ abi, bytecode: artifact.bytecode as `0x${string}` });
  const r = await pub().waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error(`deploy ${r.status}, no address`);
  set(`evm.contract.${chainKey()}`, r.contractAddress);
  return `deployed ${r.contractAddress} tx=${hash}`;
}

async function write(functionName: string, args: unknown[]) {
  const addr = contract();
  if (!addr) throw new Error('deploy the contract first');
  const hash = await wal().writeContract({ address: addr, abi, functionName, args });
  const r = await pub().waitForTransactionReceipt({ hash });
  return `${r.status} tx=${hash}`;
}
export const mint = (to: string, uri: string) => write('mint', [to, uri]);
export const send = (id: string, to: string) => write('safeTransferFrom', [address, to, BigInt(id)]);

export async function owned(): Promise<Nft[]> {
  const addr = contract();
  if (!addr) return [];
  const p = pub();
  const n = Number(await p.readContract({ address: addr, abi, functionName: 'nextTokenId' }));
  const out: Nft[] = [];
  for (let id = 0; id < n; id++) {
    const owner = await p.readContract({ address: addr, abi, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null);
    if (owner !== address) continue;
    const uri = await p.readContract({ address: addr, abi, functionName: 'tokenURI', args: [BigInt(id)] }) as string;
    out.push({ id: String(id), uri });
  }
  return out; // ponytail: O(n) ownerOf reads, fine for a test contract with tens of tokens
}

// ── Tester: generic contract plumbing with three-state results ──────────────────────────────
import { parseEventLogs } from 'viem';
import type { Result } from '../pure';
export type ContractName = keyof typeof contracts;
export const contractOf = (name: ContractName) => (name === 'PlaygroundNFT' ? contract() : (get(`evm.contract.${chainKey()}.${name}`) as Address | ''));
export const abiOf = (name: ContractName) => contracts[name].abi as any;

export async function deployNamed(name: ContractName): Promise<Result> {
  let hash: `0x${string}` | undefined;
  try {
    hash = await wal().deployContract({ abi: abiOf(name), bytecode: contracts[name].bytecode as `0x${string}` });
    const r = await pub().waitForTransactionReceipt({ hash });
    if (r.status !== 'success' || !r.contractAddress) return { status: 'failed', tx: hash, message: `deploy ${r.status} (fee spent)` };
    set(name === 'PlaygroundNFT' ? `evm.contract.${chainKey()}` : `evm.contract.${chainKey()}.${name}`, r.contractAddress);
    await waitForCode(r.contractAddress); // the public RPC is load-balanced; a lagging node answers getCode/estimateGas with "no contract"
    return { status: 'confirmed', tx: hash, message: `deployed ${name} at ${r.contractAddress}` };
  } catch (e: any) { return afterSend(e, hash); }
}
/** An error once a hash exists happened after broadcast: keep the hash, never claim "not broadcast". */
const afterSend = (e: any, hash?: `0x${string}`): Result => hash
  ? { status: 'failed', tx: hash, code: e?.name, message: `${e?.shortMessage ?? e?.message ?? e} (broadcast; check the tx)` }
  : { status: 'refused', code: e?.name, message: `${e?.shortMessage ?? e?.message ?? e} (not broadcast)` };
/** Where an existing token lives: its own contract and chain, not the currently selected ones. */
export type At = { address: Address | ''; chainKey: string };
/** True only for a contract revert (e.g. ownerOf a burned id); RPC and network errors are something else. */
export const reverted = (e: unknown) => e instanceof BaseError && !!e.walk((x) => x instanceof ContractFunctionRevertedError);

/** estimateGas (a revert here = refused, nothing broadcast) → write → receipt (reverted = failed, gas spent). */
export async function writeNamed(name: ContractName, functionName: string, args: unknown[], at: At = { address: contractOf(name), chainKey: chainKey() }): Promise<Result & { logs?: any[] }> {
  const { address, chainKey: key } = at;
  if (!address) return { status: 'refused', message: `deploy ${name} first (not broadcast)` };
  const abi = abiOf(name);
  let gas: bigint;
  try {
    if (!(await waitForCode(address, 3, key))) return { status: 'refused', message: `RPC node reports no code at ${address} yet; retry in a few seconds (not broadcast)` };
    gas = await pub(key).estimateContractGas({ address, abi, functionName, args, account });
  } catch (e: any) { return { status: 'refused', code: e?.name, message: `${e?.shortMessage ?? e?.message ?? e} (simulated, not broadcast)` }; }
  let hash: `0x${string}` | undefined;
  try {
    // A lagging public node can estimate a contract call as if the address were empty; a floor keeps the real
    // execution from running out of gas (unused gas is refunded, so over-provisioning is free).
    hash = await wal(key).writeContract({ address, abi, functionName, args, gas: (gas * 13n) / 10n > 300_000n ? (gas * 13n) / 10n : 300_000n });
    const r = await pub(key).waitForTransactionReceipt({ hash });
    if (r.status !== 'success') return { status: 'failed', tx: hash, code: 'reverted', message: `${functionName} reverted (gas spent)` };
    return { status: 'confirmed', tx: hash, message: `${functionName} ok`, logs: parseEventLogs({ abi, logs: r.logs }) };
  } catch (e: any) { return afterSend(e, hash); }
}
/** True once the RPC shows code at the address (polls, because the public endpoint lags behind its own receipts). */
export async function waitForCode(address: Address, tries = 20, key = chainKey()) {
  for (let i = 0; i < tries; i++) {
    const code = await pub(key).getCode({ address }).catch(() => undefined);
    if (code && code !== '0x') return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}
export const readNamed = (name: ContractName, functionName: string, args: unknown[] = [], at: At = { address: contractOf(name), chainKey: chainKey() }) =>
  pub(at.chainKey).readContract({ address: at.address as Address, abi: abiOf(name), functionName, args });
