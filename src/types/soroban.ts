// Soroban NFT types: one PlaygroundNft contract per variant, ids "C...:tokenId". A wallet lists a collection once it knows the
// contract, reads token_uri, invokes transfer and should refuse soulbound.
import * as so from '../chains/soroban';
import { inventory, type TestNft } from '../inventory';
import { NET, recipientAddress } from '../settings';
import type { Result } from '../pure';
import { type ChainState, type MintOpts, type NftType } from '../types';
import { validAddress } from '../validate';

const needRecipient = () => { const t = recipientAddress('stellar'); if (!t) throw new Error('set the recipient Stellar address in the Recipient field on this page'); return t; };
const split = (id: string) => { const [cid, n] = id.split(':'); return { cid, tokenId: Number(n) }; };

type Spec = { key: string; label: string; why: string; variant: so.Variant; uri: (u: string) => string };
function make(sp: Spec): NftType {
  const type: NftType = {
    key: sp.key, chain: 'stellar', label: sp.label, why: sp.why,
    explorer: (n) => so.explorer(split(n.id).cid),
    async mint(o: MintOpts) {
      // Straight to the recipient: a soulbound token can never be transferred afterwards (Error #300).
      const to = o.to === 'recipient' ? needRecipient() : so.address;
      const d = await so.deploy(sp.variant);
      if (d.status !== 'confirmed' || !d.cid) return d;
      const r = await so.mint(d.cid, to, sp.uri(o.uri));
      if (r.status !== 'confirmed') return r;
      const nft: TestNft = { chain: 'stellar', type: sp.key, network: NET, id: `${d.cid}:${r.retval}`, name: o.name, uri: sp.uri(o.uri) || undefined, mintedAt: Date.now(), mintTx: r.tx!, holder: o.to === 'recipient' ? 'recipient' : 'playground', holderAddress: to, log: [] };
      inventory.add(nft); inventory.log(nft.id, `mint to ${o.to}`, r);
      return { ...r, nft };
    },
    transfer: async (nft, to) => { if (!validAddress('stellar', to)) return { status: 'refused', message: `${to} is not a Stellar address (not broadcast)` }; const { cid, tokenId } = split(nft.id); return so.transfer(cid, to, tokenId); },
    async readback(nft): Promise<ChainState> {
      const { cid, tokenId } = split(nft.id);
      const recipient = recipientAddress('stellar');
      const meta = await so.info(cid);
      try {
        const [owner, uri] = await Promise.all([so.ownerOf(cid, tokenId), so.tokenUri(cid, tokenId)]);
        const holder = owner === so.address ? 'playground' : recipient && owner === recipient ? 'recipient' : 'other';
        return { holder, holderAddress: owner, raw: { owner, uri, ...meta }, fields: { contract: cid, tokenId, owner, uri, ...meta } };
      } catch (e: any) {
        if (/NonExistentToken|#200/.test(String(e?.message))) return { holder: 'other', raw: String(e), fields: { contract: cid, tokenId, note: 'token does not exist (burned)', ...meta } };
        throw e;
      }
    },
    extra: {
      'Burn out of holder (owner)': (nft: TestNft): Promise<Result> => { const { cid, tokenId } = split(nft.id); return so.ownerBurn(cid, tokenId); },
    },
  };
  return type;
}

export const sorobanTypes: NftType[] = [
  make({ key: 'soroban.standard', label: 'Soroban: Standard', variant: 'standard', uri: (u) => u,
    why: 'OpenZeppelin NonFungibleToken + Burnable. No trust line, no reserve, metadata URL on chain via token_uri. The baseline a wallet should list and send.' }),
  make({ key: 'soroban.nometa', label: 'Soroban: No metadata', variant: 'standard', uri: () => '',
    why: 'Same contract, token_uri is "". A wallet should show a placeholder, not fail the list.' }),
  make({ key: 'soroban.soulbound', label: 'Soroban: Soulbound', variant: 'soulbound', uri: (u) => u,
    why: 'transfer and transfer_from panic with Error(Contract, #300). A wallet should refuse the send at the dry run (simulation), before signing; nothing is spent.' }),
];
