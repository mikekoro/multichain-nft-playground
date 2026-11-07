// The tester's memory of what it minted. localStorage; the chain is the truth and refreshes `holder`.
import { useSyncExternalStore } from 'react';
import type { Chain, Holder, Result } from './pure';
import { mergeHolder } from './pure';
import { ns } from './settings';

export type LogEntry = { at: number; action: string; tx?: string; result: string };
export type TestNft = {
  chain: Chain; type: string; network: string; id: string; name: string; uri?: string;
  mintedAt: number; mintTx: string; holder: Holder; holderAddress?: string; amount?: string; log: LogEntry[];
  /** Test-only key material the type needs later (a Stellar issuer secret). Throwaway, like every key here. */
  secrets?: Record<string, string>;
};

const KEY = ns('inventory');
let items: TestNft[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
const subs = new Set<() => void>();
const commit = (next: TestNft[]) => { items = next; localStorage.setItem(KEY, JSON.stringify(items)); subs.forEach((s) => s()); };

export const inventory = {
  list: () => items,
  add: (n: TestNft) => commit([n, ...items.filter((x) => x.id !== n.id)]),
  remove: (id: string) => commit(items.filter((x) => x.id !== id)),
  patch: (id: string, p: Partial<TestNft>) => commit(items.map((x) => (x.id === id ? { ...x, ...p } : x))),
  setHolder: (id: string, holder: Holder, holderAddress?: string) =>
    commit(items.map((x) => (x.id === id ? { ...x, holder: mergeHolder(x.holder, holder), holderAddress: holder === 'unknown' ? x.holderAddress : holderAddress } : x))),
  log: (id: string, action: string, r: Result) =>
    commit(items.map((x) => (x.id === id ? { ...x, log: [{ at: Date.now(), action, tx: r.tx, result: `${r.status}: ${r.message}` }, ...x.log].slice(0, 50) } : x))),
};

export const useInventory = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => items);
