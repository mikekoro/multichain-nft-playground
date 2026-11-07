// Soroban NFTs: the PlaygroundNft contract (contracts/soroban, OpenZeppelin Base + Burnable) deployed once per
// variant from the browser, then mint / transfer / owner_burn invoked with the same account the classic Stellar side uses.
import { Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { endpoint, env, get, MAINNET, set } from '../settings';
import type { Result } from '../pure';
import { q } from './stellar'; // same account, same sequence queue

const server = new rpc.Server(endpoint('SOROBAN_RPC'));
const passphrase = MAINNET ? Networks.PUBLIC : Networks.TESTNET;
const kp = Keypair.fromSecret(env.VITE_STELLAR_SECRET);
export const address = kp.publicKey();
export const explorer = (cid: string) => `https://stellar.expert/explorer/${MAINNET ? 'public' : 'testnet'}/contract/${cid}`;

/** Contract error codes: OpenZeppelin non-fungible (200+) and ours (300). */
const ERRORS: Record<string, string> = { 200: 'NonExistentToken', 201: 'IncorrectOwner', 202: 'InsufficientApproval', 203: 'InvalidApprover', 204: 'InvalidLiveUntilLedger', 205: 'InvalidAmount', 206: 'TokenIDsAreDepleted', 300: 'Soulbound' };
const words = (s: string) => s.replace(/Error\(Contract, #(\d+)\)/g, (_, n) => `Error(Contract, #${n} ${ERRORS[n] ?? ''})`);

const str = (s: string) => nativeToScVal(s, { type: 'string' });
const addr = (a: string) => new Address(a).toScVal();
const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });

/** Inclusion bid: mainnet's Soroban lane surges (2026-10-31: every included tx bid 200 stroops; a 100-stroop deploy was
 *  dropped), so bid twice the recent p99. Still a few hundred stroops. */
const inclusionFee = async () => String(Math.max(Number(BASE_FEE), 2 * Number((await server.getFeeStats()).sorobanInclusionFee.p99)));
/** Valid for this long; polling outlasts it, so NOT_FOUND afterwards means expired, never "may still land". */
const WINDOW_S = 60;

/** Build, simulate, sign, send, poll. A simulation error is refused (nothing broadcast); FAILED on chain = fee spent. */
async function invoke(label: string, op: xdr.Operation): Promise<Result & { retval?: any }> {
  return q(address, async () => {
    const acct = await server.getAccount(address);
    const tx = new TransactionBuilder(acct, { fee: await inclusionFee(), networkPassphrase: passphrase }).addOperation(op).setTimeout(WINDOW_S).build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      const code = sim.error.match(/Error\(\w+, #?\w+\)/)?.[0];
      return { status: 'refused', code, message: `${label}: ${words(sim.error.split(/\n\nEvent log/)[0]).slice(0, 300)} (simulated, not broadcast)` };
    }
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(kp);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') return { status: 'refused', message: `${label}: send ${sent.status} ${JSON.stringify(sent.errorResult)} (not broadcast)` };
    const res = await server.pollTransaction(sent.hash, { attempts: WINDOW_S + 15 }); // 1 s apart
    if (res.status === 'SUCCESS') return { status: 'confirmed', tx: sent.hash, message: `${label} ok`, retval: res.returnValue ? scValToNative(res.returnValue) : undefined };
    if (res.status === 'NOT_FOUND') return { status: 'refused', tx: sent.hash, message: `${label}: not in a ledger before its ${WINDOW_S} s window closed: dropped, nothing spent; retry` };
    return { status: 'failed', tx: sent.hash, message: `${label}: ${res.status} (fee spent)` };
  });
}

/** Read-only call via simulation. */
export async function read<T = any>(cid: string, fn: string, ...args: xdr.ScVal[]): Promise<T> {
  const acct = await server.getAccount(address);
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(new Contract(cid).call(fn, ...args)).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(words(sim.error));
  return scValToNative((sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval);
}

export type Variant = 'standard' | 'soulbound';
export const contractOf = (v: Variant) => get(`soroban.contract.${v}`);

/** Upload the wasm (idempotent) and create one contract per variant; the id is cached in localStorage. */
export async function deploy(v: Variant): Promise<Result & { cid?: string }> {
  const cached = contractOf(v);
  if (cached) return { status: 'confirmed', message: `already deployed ${cached}`, cid: cached };
  // Node (the CLI, Vite SSR) has no server for /public: read the file from the repo root.
  const res = import.meta.env.SSR ? null : await fetch('/playground_nft.wasm');
  if (res && !res.ok) return { status: 'refused', message: `/playground_nft.wasm: HTTP ${res.status}; run npm run build:soroban (not broadcast)` };
  const wasm = res ? Buffer.from(await res.arrayBuffer()) : (globalThis as any).process.getBuiltinModule('node:fs').readFileSync('public/playground_nft.wasm');
  const up = await invoke('upload wasm', Operation.uploadContractWasm({ wasm }));
  if (up.status !== 'confirmed') return up;
  const wasmHash = Buffer.from(up.retval);
  const name = v === 'soulbound' ? 'Playground Soulbound' : 'Playground Soroban NFT';
  const symbol = v === 'soulbound' ? 'TSB' : 'TST';
  const cr = await invoke(`deploy ${v}`, Operation.createCustomContract({
    address: new Address(address), wasmHash,
    constructorArgs: [str(name), str(symbol), addr(address), nativeToScVal(v !== 'soulbound', { type: 'bool' })],
  }));
  if (cr.status !== 'confirmed') return cr;
  const cid = typeof cr.retval === 'string' ? cr.retval : Address.fromScVal(xdr.ScVal.fromXDR(cr.retval)).toString();
  set(`soroban.contract.${v}`, cid);
  return { ...cr, message: `deployed ${v} at ${cid}`, cid };
}

/** Owner-only mint of the next id to `to`, with the full metadata URL ("" = none). */
export const mint = (cid: string, to: string, uri: string) => invoke('mint', new Contract(cid).call('mint', addr(to), str(uri)));
export const transfer = (cid: string, to: string, tokenId: number) => invoke('transfer', new Contract(cid).call('transfer', addr(address), addr(to), u32(tokenId)));
export const ownerBurn = (cid: string, tokenId: number) => invoke('owner_burn', new Contract(cid).call('owner_burn', u32(tokenId)));
export const ownerOf = (cid: string, tokenId: number) => read<string>(cid, 'owner_of', u32(tokenId));
export const tokenUri = (cid: string, tokenId: number) => read<string>(cid, 'token_uri', u32(tokenId));
export const info = async (cid: string) => ({ name: await read<string>(cid, 'name'), symbol: await read<string>(cid, 'symbol'), transferable: await read<boolean>(cid, 'transferable') });
