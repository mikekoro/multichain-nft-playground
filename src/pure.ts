// Pure rules shared by the app and `node --test`. No imports: node loads this file directly.
export type Status = 'confirmed' | 'failed' | 'refused';
/** confirmed = the chain finalised it; failed = reached the chain and failed (fee spent); refused = never broadcast. */
export type Result = { status: Status; tx?: string; code?: string; message: string };
export type Holder = 'playground' | 'recipient' | 'other' | 'unknown';

export const XRPL_FLAGS = { burnable: 1, transferable: 8 } as const;
/** TransferFee is in 1/100000 units: 5 % = 5000. Valid only with tfTransferable, max 50 %. */
export const transferFee = (pct: number) => {
  if (pct < 0 || pct > 50) throw new Error('transfer fee must be 0-50 %');
  return Math.round(pct * 1000);
};

/** XRPL engine result → the three states. tes = confirmed; tec = applied, fee burned; tem/tef/ter/tel = not in a ledger. */
export function xrplResult(code: string, hash?: string, detail?: string): Result {
  const message = detail ? `${code}: ${detail}` : code;
  if (code === 'tesSUCCESS') return { status: 'confirmed', tx: hash, code, message };
  if (code.startsWith('tec')) return { status: 'failed', tx: hash, code, message: `${message} (fee spent)` };
  return { status: 'refused', code, message: `${message} (not broadcast)` };
}

/** A chain read that could not resolve the holder never erases what we knew. */
export const mergeHolder = (known: Holder | undefined, read: Holder): Holder => (read === 'unknown' ? known ?? 'unknown' : read);

/** The CLI's one JSON line: results carry bigints (EVM ids, amounts) that JSON.stringify throws on. */
export const jsonLine = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? String(v) : v));

export const CHAINS = ['xrpl', 'evm', 'solana', 'stellar'] as const;
export type Chain = (typeof CHAINS)[number];

/** Per-key promise chain: one in-flight write per account, so two clicks can't race a sequence number. */
export function queue() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(fn, fn);
    tails.set(key, next.catch(() => {}));
    return next;
  };
}

