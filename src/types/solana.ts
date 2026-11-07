// The four Solana kinds, each moved by a different program.
import * as s from '../chains/solana';
import { inventory, type TestNft } from '../inventory';
import { NET, recipientAddress } from '../settings';
import { type ChainState, type MintOpts, type NftType } from '../types';
import { validAddress } from '../validate';
import type { Result } from '../pure';

const needRecipient = () => { const t = recipientAddress('solana'); if (!t) throw new Error('set the recipient Solana address in the Recipient field on this page'); return t; };
const holderOf = (owner: string | null): ChainState['holder'] => !owner ? 'unknown' : owner === 'other' ? 'other' : owner === s.address ? 'playground' : owner === recipientAddress('solana') ? 'recipient' : 'other';

type Spec = { key: string; label: string; why: string; standard: string;
  mint: (o: { name: string; uri: string; to?: string }) => Promise<Result & { id: string }>;
  transfer: (id: string, to: string) => Promise<Result>;
  owner: (nft: TestNft) => Promise<{ owner: string | null; fields: Record<string, any>; raw: unknown }> };

const make = (sp: Spec): NftType => ({
  key: sp.key, chain: 'solana', label: sp.label, why: sp.why,
  explorer: (n) => `https://explorer.solana.com/address/${n.id}${s.cluster}`,
  async mint(o: MintOpts) {
    const to = o.to === 'recipient' ? needRecipient() : undefined;
    const r = await sp.mint({ name: o.name, uri: o.uri, to });
    if (r.status !== 'confirmed' || !r.id) return r;
    const nft: TestNft = { chain: 'solana', type: sp.key, network: NET, id: r.id, name: o.name, uri: o.uri, mintedAt: Date.now(), mintTx: r.tx!, holder: to ? 'recipient' : 'playground', holderAddress: to ?? s.address, log: [] };
    inventory.add(nft); inventory.log(nft.id, `mint to ${o.to}`, r);
    return { ...r, nft };
  },
  transfer: (nft, to) => validAddress('solana', to) ? sp.transfer(nft.id, to) : Promise.resolve({ status: 'refused', message: `${to} is not a Solana address (not broadcast)` }),
  async readback(nft) {
    const { owner, fields, raw } = await sp.owner(nft);
    return { holder: holderOf(owner), holderAddress: owner ?? undefined, raw, fields: { standard: sp.standard, ...fields } };
  },
});

const tokenOwner = async (nft: TestNft) => { const h = await s.tokenHolder(nft.id, [s.address, recipientAddress('solana')]); return { owner: h.owner === null ? 'other' : h.owner, raw: h.raw, fields: { mint: nft.id, frozenTokenAccount: h.frozen } }; };

export const solanaTypes: NftType[] = [
  make({ key: 'sol.standard', label: 'Standard', standard: 'Metaplex NonFungible', why: 'The baseline: a wallet should list it (DAS) and send it as an SPL transfer.',
    mint: (o) => s.mintToken('standard', o), transfer: (id, to) => s.transferToken('standard', id, to), owner: tokenOwner }),
  make({ key: 'sol.pnft', label: 'Programmable (pNFT)', standard: 'Metaplex ProgrammableNonFungible', why: 'Token account is frozen by the program; it must move via Token Metadata transferV1; a plain SPL transfer fails.',
    mint: (o) => s.mintToken('pnft', o), transfer: (id, to) => s.transferToken('pnft', id, to), owner: tokenOwner }),
  make({ key: 'sol.core', label: 'Core', standard: 'Metaplex Core (MplCoreAsset)', why: 'No mint, no token account: one asset account. A wallet must transfer it through the Core program, not a token account.',
    mint: s.mintCore, transfer: s.transferCore, owner: async (n) => { const c = await s.coreOwner(n.id); return { owner: c.owner, raw: c.raw, fields: { asset: n.id, name: c.name, uri: c.uri } }; } }),
  make({ key: 'sol.compressed', label: 'Compressed', standard: 'Bubblegum (compressed)', why: 'A leaf in a Merkle tree; moving it needs a DAS proof. A wallet needs DAS to list and send it. Reads and transfers here need VITE_SOLANA_DAS_RPC (a DAS RPC, e.g. Helius) in .env.local.',
    mint: s.mintCompressed, transfer: s.transferCompressed,
    owner: async (n) => { const a = await s.dasAsset(n.id); return a ? { owner: a.ownership?.owner ?? null, raw: a, fields: { assetId: n.id, compressed: a.compression?.compressed, tree: a.compression?.tree, leaf: a.compression?.leaf_id } } : { owner: null, raw: null, fields: { assetId: n.id, note: 'set VITE_SOLANA_DAS_RPC in .env.local to read compressed assets' } }; } }),
];
