// Everything the user pastes once lives in localStorage. Keys are generated into .env.local.
export const env = import.meta.env as Record<string, string>;
/** VITE_NETWORK=mainnet (in .env.local, or `npm run dev:mainnet`) points every chain at mainnet. Anything else = testnets. */
export const MAINNET = env.VITE_NETWORK === 'mainnet';
export const NET = MAINNET ? 'mainnet' : 'testnet';
/** An endpoint from .env (public defaults) or .env.local (overrides); `_MAINNET` twin on mainnet. Missing and required = a clear error. */
export const endpoint = (name: string, required = true) => {
  const k = `VITE_${name}${MAINNET ? '_MAINNET' : ''}`, v = env[k]?.trim() ?? '';
  if (!v && required) throw new Error(`${k} is not set: add it to .env.local (defaults live in .env)`);
  return v;
};
/** Mainnet state (contracts, inventory, recipient addresses) lives under its own prefix; testnet keys are unchanged.
 *  The metadata base is a plain URL, the same on every network, so it is shared. */
export const ns = (k: string) => (MAINNET && k !== 'meta.base' ? `mainnet.${k}` : k);
export const get = (k: string, fallback = '') => localStorage.getItem(ns(k)) ?? fallback;
export const set = (k: string, v: string) => localStorage.setItem(ns(k), v);
export const DEFAULT_META_BASE = 'https://raw.githubusercontent.com/mikekoro/multichain-nft-playground/main/public/samples';
/** The sample metadata base; empty (or never set) = the samples in this repo on GitHub. */
export const metaBase = () => (get('meta.base').trim() || DEFAULT_META_BASE).replace(/\/$/, '');
export const recipientAddress = (chain: 'xrpl' | 'evm' | 'solana' | 'stellar') => get(`recipient.${chain}`).trim();

export type Nft = { id: string; uri?: string; name?: string; note?: string };
export type Meta = { name?: string; image?: string };

const metaCache = new Map<string, Promise<Meta>>();
/** Browser-side read of a token's metadata JSON, for the NFTs table. Same URL a wallet would fetch. */
export function fetchMeta(uri?: string): Promise<Meta> {
  if (!uri) return Promise.resolve({});
  const url = uri.startsWith('ipfs://') ? `${endpoint('IPFS_GATEWAY')}${uri.slice(7)}` : uri;
  if (!metaCache.has(url)) {
    metaCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  return metaCache.get(url)!;
}
