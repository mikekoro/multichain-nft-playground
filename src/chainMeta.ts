// Per-chain UI config (wallet, balance) plus one shared balance store, so the sidebar, the overview and the
// chain page read the same numbers from one fetch.
import { useSyncExternalStore } from 'react';
import { MAINNET, NET, type Nft } from './settings';
import { CHAINS, type Chain, type Holder } from './pure';
import { inventory, useInventory, type TestNft } from './inventory';
import { typeOf } from './registry';
import * as x from './chains/xrpl';
import * as e from './chains/evm';
import * as s from './chains/solana';
import * as st from './chains/stellar';

export type ChainMeta = {
  chain: Chain; label: string; /** /chains/*.svg */ logo: string; network: () => string; address: () => string; explorer: () => string;
  balance: () => Promise<string>;
  /** Recommended balance: a few full mint runs, measured on mainnet 2026-10-21 (XRPL 1 XRP reserve + 0.2 per page/offer;
   *  Arbitrum ~0.000076 ETH of deploys at 0.02 gwei; Solana ~0.05 SOL a run; Stellar's one-time wasm upload is 14.4 XLM). */
  need: number; unit: string;
  /** Explorer page for a transaction hash; `network` is the NFT's own (EVM: its chain key). */
  tx: (hash: string, network?: string) => string;
};

/** The network key the mint log records (EVM: the selected chain), so every count matches the chain page's table. */
export const netOf = (c: Chain) => c === 'evm' ? e.chainKey() : NET;

/** EVM network logos for the network Select. */
export const evmLogo = (k: string) => `/chains/${({ baseSepolia: 'base', arbitrum: 'arb' } as Record<string, string>)[k] ?? 'eth'}.svg`;

const stellarNet = MAINNET ? 'public' : 'testnet';
export const META: Record<Chain, ChainMeta> = {
  xrpl: { chain: 'xrpl', label: 'XRPL', logo: '/chains/xrp.svg', network: () => MAINNET ? 'Mainnet' : 'Testnet', address: () => x.address, explorer: () => x.explorer,
    balance: x.balance, need: 5, unit: 'XRP', tx: (h) => `${x.explorerBase}/transactions/${h}` },
  evm: { chain: 'evm', label: 'EVM', logo: '/chains/eth.svg', network: () => e.chains[e.chainKey()].name, address: () => e.address, explorer: e.explorer,
    balance: () => e.balance(), need: 0.001, unit: 'ETH',
    tx: (h, n = e.chainKey()) => `${e.chains[n]?.blockExplorers?.default.url}/tx/${h}` },
  solana: { chain: 'solana', label: 'Solana', logo: '/chains/sol.svg', network: () => MAINNET ? 'Mainnet' : 'Devnet', address: () => s.address, explorer: () => s.explorer,
    balance: s.balance, need: 0.1, unit: 'SOL', tx: (h) => `https://explorer.solana.com/tx/${h}${s.cluster}` },
  stellar: { chain: 'stellar', label: 'Stellar', logo: '/chains/xlm.svg', network: () => MAINNET ? 'Mainnet' : 'Testnet', address: () => st.address, explorer: () => st.explorer,
    balance: st.balance, need: 20, unit: 'XLM', tx: (h) => `https://stellar.expert/explorer/${stellarNet}/tx/${h}` },
};

/** Below the recommended amount. "unfunded" parses as NaN = low; an RPC error or a pending read is not flagged. */
export const low = (bal: string | undefined, need: number) => !!bal && !bal.startsWith('error') && !(parseFloat(bal) >= need);

/** "0.039909175329963634 ETH" → "0.039909 ETH": readable, not rounded to zero. Errors and "unfunded" pass through. */
export const fmtBal = (b: string) => b.replace(/^(\d+(?:\.\d+)?)(?=\s)/, (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: Number(n) < 1 ? 6 : 4 }));

const bals: Partial<Record<Chain, string>> = {};
const seq: Partial<Record<Chain, number>> = {};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
/** Re-reads one chain's balance; a slower stale read (EVM network switched mid-flight) is dropped. */
export function refreshBalance(c: Chain) {
  const n = (seq[c] = (seq[c] ?? 0) + 1);
  delete bals[c]; emit();
  META[c].balance().catch((err) => `error: ${err?.message ?? err}`).then((b) => { if (seq[c] === n) { bals[c] = b; emit(); } });
}
CHAINS.forEach(refreshBalance);
/** undefined while loading. */
export const useBalance = (c: Chain) => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => bals[c]);

// ── The wallet's own NFT listing, one store for the sidebar, the overview and the chain page ─────────────
/** EVM reads PlaygroundNFT only; its ids get the `contract:` prefix the mint log uses. Stellar has no listing. */
export const OWNED: Partial<Record<Chain, () => Promise<Nft[]>>> = {
  xrpl: x.owned,
  evm: async () => (await e.owned()).map((n) => ({ ...n, id: `${e.contract()}:${n.id}` })),
  solana: s.owned,
};
type Held = { list: Nft[] | null; err: string };
const held: Partial<Record<Chain, Held>> = {};
const hseq: Partial<Record<Chain, number>> = {};
/** Re-reads the listing; keeps the last one while reading (no flicker) unless `clear` (EVM network switch). */
export function refreshHeld(c: Chain, clear = false): Promise<unknown> {
  const f = OWNED[c];
  if (!f) return Promise.resolve();
  const n = (hseq[c] = (hseq[c] ?? 0) + 1);
  if (clear) { held[c] = { list: null, err: '' }; emit(); }
  return f().then((list) => ({ list, err: '' }), (err) => ({ list: held[c]?.list ?? null, err: String(err?.message ?? err) }))
    .then((h) => { if (hseq[c] === n) { held[c] = h; emit(); } });
}
CHAINS.forEach((c) => refreshHeld(c));
const NONE: Held = { list: null, err: '' };
export const useHeld = (c: Chain) => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => held[c] ?? NONE);

/** Re-reads one logged NFT's holder into the log. */
export const readback = (n: TestNft) => typeOf(n.type)?.readback(n).then((st) => { inventory.setHolder(n.id, st.holder, st.holderAddress); return st; });
/** Re-reads every logged holder on this chain's current network (sends accepted elsewhere change them silently). */
export const readbackAll = (c: Chain) => Promise.all(inventory.list().filter((n) => n.chain === c && n.network === netOf(c)).map((n) => readback(n)?.catch(() => {})));

/** One NFTs-table row. `nft`: minted here (type, log, the type's actions). `held`: the wallet holds it. `held` only = untracked. */
export type Row = { id: string; chain: Chain; nft?: TestNft; held?: Nft; holder: Holder };
/** The wallet's listing merged with this network's mint log, keyed by id. The live listing wins for "In wallet". */
export function useRows(chain: Chain): Row[] {
  const network = netOf(chain);
  const log = useInventory().filter((n) => n.chain === chain && n.network === network);
  const list = useHeld(chain).list ?? [];
  const logged = new Set(log.map((n) => n.id));
  const byId = new Map(list.map((h) => [h.id, h]));
  return [
    ...log.map((n): Row => ({ id: n.id, chain, nft: n, held: byId.get(n.id), holder: byId.has(n.id) ? 'playground' : n.holder })),
    ...list.filter((h) => !logged.has(h.id)).map((h): Row => ({ id: h.id, chain, held: h, holder: 'playground' })),
  ];
}
