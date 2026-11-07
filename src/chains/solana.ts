import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, keypairIdentity, none, percentAmount, publicKey, sol, type PublicKey, type Umi } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { createNft, createProgrammableNft, fetchAllDigitalAssetWithTokenByOwner, mplTokenMetadata, transferV1, TokenStandard } from '@metaplex-foundation/mpl-token-metadata';
import { create as coreCreate, fetchAsset as coreFetch, mplCore, transfer as coreTransfer } from '@metaplex-foundation/mpl-core';
import { createTree, getAssetWithProof, mintV1, mplBubblegum, parseLeafFromMintV1Transaction, safeFetchTreeConfigFromSeeds, transfer as cnftTransfer } from '@metaplex-foundation/mpl-bubblegum';
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
import { findAssociatedTokenPda, safeFetchToken, TokenState } from '@metaplex-foundation/mpl-toolbox';
import { endpoint, env, get, MAINNET, set, type Nft } from '../settings';
import { queue, type Result } from '../pure';

/** A DAS-capable RPC (Helius etc.) for compressed-NFT proofs and reads; optional (.env). */
export const dasUrl = () => endpoint('SOLANA_DAS_RPC', false);
/** Mainnet: the public RPC answers browsers with 403; set VITE_SOLANA_RPC_MAINNET to a Helius (or other) URL. */
export const RPC = endpoint('SOLANA_RPC');
export const cluster = MAINNET ? '' : '?cluster=devnet';
const mk = (url: string) => createUmi(url).use(mplTokenMetadata()).use(mplCore()).use(mplBubblegum()).use(dasApi());
const umi = mk(RPC);
const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(atob(env.VITE_SOLANA_SECRET), (ch) => ch.charCodeAt(0)));
umi.use(keypairIdentity(kp));
/** Same identity on the DAS endpoint, when one is set. */
const das = (): Umi | null => { const u = dasUrl(); return u ? mk(u).use(keypairIdentity(kp)) : null; };
export const address = kp.publicKey.toString();
export const explorer = `https://explorer.solana.com/address/${address}${cluster}`;
const sig = (s: Uint8Array) => base58.deserialize(s)[0];
const q = queue();

export async function balance() { return `${Number((await umi.rpc.getBalance(kp.publicKey)).basisPoints) / 1e9} SOL`; }
export const fund = MAINNET ? undefined : async () => { await umi.rpc.airdrop(kp.publicKey, sol(1)); return 'airdrop 1 SOL requested'; };

/** Preflight simulation failure = refused (nothing broadcast); anything after = failed. Confirmed at `finalized`. */
export function run(label: string, build: () => Promise<{ sendAndConfirm: (u: Umi, o?: any) => Promise<{ signature: Uint8Array }> }> | { sendAndConfirm: (u: Umi, o?: any) => Promise<{ signature: Uint8Array }> }, u: Umi = umi): Promise<Result> {
  return q(address, async () => {
    try {
      const tx = await build();
      const r = await tx.sendAndConfirm(u, { confirm: { commitment: 'finalized' } });
      return { status: 'confirmed', tx: sig(r.signature), message: `${label} ok` };
    } catch (e: any) {
      const m = String(e?.message ?? e);
      const refused = /simulat|preflight|blockhash|insufficient funds for rent|Attempt to debit/i.test(m) && !/expired/i.test(m);
      return { status: refused ? 'refused' : 'failed', code: e?.name, message: `${label}: ${m.slice(0, 300)} (${refused ? 'not broadcast' : 'reached the chain'})` };
    }
  });
}

// ── the existing ad-hoc tab ──
export async function mint(o: { name: string; uri: string; to?: string }) {
  const mintSigner = generateSigner(umi);
  const r = await run('mint', () => createNft(umi, { mint: mintSigner, name: o.name, uri: o.uri, sellerFeeBasisPoints: percentAmount(0), ...(o.to ? { tokenOwner: publicKey(o.to) } : {}) }));
  return r.status === 'confirmed' ? `minted ${mintSigner.publicKey} sig=${r.tx}` : `${r.status}: ${r.message}`;
}
export async function owned(): Promise<Nft[]> {
  const assets = await fetchAllDigitalAssetWithTokenByOwner(umi, kp.publicKey);
  return assets.map((a) => ({ id: a.publicKey.toString(), name: a.metadata.name, uri: a.metadata.uri }));
}
export async function send(mint: string, to: string) {
  const r = await run('transfer', () => transferV1(umi, { mint: publicKey(mint), authority: umi.identity, tokenOwner: kp.publicKey, destinationOwner: publicKey(to), tokenStandard: TokenStandard.NonFungible }));
  return r.status === 'confirmed' ? `sent sig=${r.tx}` : `${r.status}: ${r.message}`;
}

// ── tester types ──
export type Std = 'standard' | 'pnft';
export async function mintToken(std: Std, o: { name: string; uri: string; to?: string }) {
  const mintSigner = generateSigner(umi);
  const args = { mint: mintSigner, name: o.name, uri: o.uri, sellerFeeBasisPoints: percentAmount(0, 2), ...(o.to ? { tokenOwner: publicKey(o.to) } : {}) };
  const r = await run(`mint ${std}`, () => (std === 'pnft' ? createProgrammableNft(umi, args) : createNft(umi, args)));
  return { ...r, id: mintSigner.publicKey.toString() };
}
export const transferToken = (std: Std, mint: string, to: string) => run(`transfer ${std}`, () => transferV1(umi, {
  mint: publicKey(mint), authority: umi.identity, tokenOwner: kp.publicKey, destinationOwner: publicKey(to),
  tokenStandard: std === 'pnft' ? TokenStandard.ProgrammableNonFungible : TokenStandard.NonFungible,
}));
/** Who holds a token-based NFT: the associated token account of each candidate owner (playground, then the recipient).
 *  getTokenLargestAccounts is rate-limited on the public devnet RPC, so we never call it. */
export async function tokenHolder(mint: string, candidates: string[]): Promise<{ owner: string | null; frozen: boolean | null; raw: unknown }> {
  for (const owner of candidates.filter(Boolean)) {
    const [ata] = findAssociatedTokenPda(umi, { mint: publicKey(mint), owner: publicKey(owner) });
    const t = await safeFetchToken(umi, ata);
    if (t && t.amount > 0n) return { owner, frozen: t.state === TokenState.Frozen, raw: { ata: ata.toString(), amount: String(t.amount), state: t.state } };
  }
  return { owner: null, frozen: null, raw: 'no candidate owner holds it' };
}

export async function mintCore(o: { name: string; uri: string; to?: string }) {
  const asset = generateSigner(umi);
  const r = await run('mint core', () => coreCreate(umi, { asset, name: o.name, uri: o.uri, ...(o.to ? { owner: publicKey(o.to) } : {}) }));
  return { ...r, id: asset.publicKey.toString() };
}
export const transferCore = async (asset: string, to: string) => run('transfer core', async () => coreTransfer(umi, { asset: await coreFetch(umi, publicKey(asset)), newOwner: publicKey(to) }));
export const coreOwner = async (asset: string) => { const a = await coreFetch(umi, publicKey(asset)); return { owner: a.owner.toString(), name: a.name, uri: a.uri, raw: a }; };

/** One small tree for the playground: depth 5, buffer 8, no canopy (32 leaves; proofs come from DAS). Reused once created. */
export async function ensureTree(): Promise<{ tree: string; result?: Result }> {
  const existing = get('solana.tree');
  if (existing && await safeFetchTreeConfigFromSeeds(umi, { merkleTree: publicKey(existing) })) return { tree: existing }; // null = gone: recreate; a read error throws
  const merkleTree = generateSigner(umi);
  const r = await run('create tree', () => createTree(umi, { merkleTree, maxDepth: 5, maxBufferSize: 8 }));
  if (r.status === 'confirmed') set('solana.tree', merkleTree.publicKey.toString());
  return { tree: merkleTree.publicKey.toString(), result: r };
}
export async function mintCompressed(o: { name: string; uri: string; to?: string }) {
  const { tree, result } = await ensureTree();
  if (result && result.status !== 'confirmed') return { ...result, id: '' };
  const merkleTree = publicKey(tree);
  const r = await run('mint compressed', () => mintV1(umi, { leafOwner: o.to ? publicKey(o.to) : kp.publicKey, merkleTree,
    metadata: { name: o.name, uri: o.uri, sellerFeeBasisPoints: 0, collection: none(), creators: [] } }));
  if (r.status !== 'confirmed') return { ...r, id: '', tree };
  // The leaf comes from the mint tx itself: numMinted read before the queue could race another mint.
  // A lagging node answers getTransaction with null right after confirmation: retry, then keep the confirmed hash anyway.
  let leaf;
  for (let i = 0; i < 3 && !leaf; i++) leaf = await parseLeafFromMintV1Transaction(umi, base58.serialize(r.tx!)).catch(() => new Promise<undefined>((ok) => setTimeout(ok, 2000)));
  if (!leaf) return { ...r, id: '', tree, message: `${r.message}; leaf not readable yet, tx ${r.tx}` };
  return { ...r, id: leaf.id.toString(), tree, leafIndex: Number(leaf.nonce) };
}
export async function transferCompressed(assetId: string, to: string): Promise<Result> {
  const d = das();
  if (!d) return { status: 'refused', message: 'compressed transfers need VITE_SOLANA_DAS_RPC (Helius) in .env.local (not broadcast)' };
  return run('transfer compressed', async () => cnftTransfer(d, { ...(await getAssetWithProof(d as any, publicKey(assetId), { truncateCanopy: true })), leafOwner: d.identity, newLeafOwner: publicKey(to) }), d);
}
export async function dasAsset(id: string): Promise<any | null> {
  const d = das(); if (!d) return null;
  return (d.rpc as any).getAsset(publicKey(id));
}
export type { PublicKey };
