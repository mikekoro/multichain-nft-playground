// The four XRPL types: one XLS-20 standard, four flag settings a wallet must treat differently.
import * as x from '../chains/xrpl';
import { inventory, type TestNft } from '../inventory';
import { XRPL_FLAGS, transferFee, type Result } from '../pure';
import { NET, recipientAddress } from '../settings';
import { type ChainState, type MintOpts, type NftType } from '../types';
import { validAddress } from '../validate';

const needRecipient = () => { const t = recipientAddress('xrpl'); if (!t) throw new Error('set the recipient XRPL address in the Recipient field on this page'); return t; };

async function readback(nft: TestNft): Promise<ChainState> {
  const recipient = recipientAddress('xrpl');
  const find = (list: any[]) => list.find((n) => n.NFTokenID === nft.id);
  const candidates: [string, 'playground' | 'recipient'][] = [[x.address, 'playground'], ...(recipient ? [[recipient, 'recipient'] as [string, 'recipient']] : [])];
  for (const [acct, holder] of candidates) {
    const n = find(await x.nftsOf(acct));
    if (n) return { holder, holderAddress: acct, raw: n, fields: {
      issuer: n.Issuer, taxon: n.NFTokenTaxon, flags: n.Flags, transferable: !!(n.Flags & 8), burnable: !!(n.Flags & 1),
      transferFeePct: (n.TransferFee ?? 0) / 1000, uri: n.URI ? x.convertHexToString(n.URI) : null, serial: n.nft_serial ?? null,
    } };
  }
  // Both reads succeeded and neither account holds it: a definite state (burned, or accepted by someone else), not 'unknown'.
  return { holder: 'other', raw: null, fields: { note: recipient ? 'not held by the lab wallet or the recipient: burned, or held elsewhere' : 'not held by the lab wallet; no recipient address set to check' } };
}

function make(key: string, label: string, why: string, flags: number, fee: number | undefined): NftType {
  const type: NftType = {
    key, chain: 'xrpl', label, why,
    explorer: (n) => `${x.explorerBase}/nft/${n.id}`,
    async mint(o: MintOpts) {
      const to = o.to === 'recipient' ? needRecipient() : undefined; // before minting, so a missing address costs nothing
      const r = await x.mint({ uri: o.uri, flags, transferFee: fee });
      if (r.status !== 'confirmed' || !r.nftId) return r;
      const nft: TestNft = { chain: 'xrpl', type: key, network: NET, id: r.nftId, name: o.name, uri: o.uri, mintedAt: Date.now(), mintTx: r.tx!, holder: 'playground', holderAddress: x.address, log: [] };
      inventory.add(nft); inventory.log(nft.id, 'mint', r);
      if (to) { const t = await type.transfer(nft, to); inventory.log(nft.id, 'offer to recipient', t); return { ...t, nft }; }
      return { ...r, nft };
    },
    transfer: async (nft, to, o) => validAddress('xrpl', to) ? x.sellOffer(nft.id, to, o?.priceXrp ?? '0') : { status: 'refused', message: `${to} is not an XRPL address (not broadcast)` },
    readback,
    extra: {
      // Verified on testnet 2026-10-20: a holder's sell offer back to the issuer is tefNFTOKEN_IS_NOT_TRANSFERABLE; only the issuer can move it.
      ...(flags & XRPL_FLAGS.transferable ? {} : { 'Buy back from holder (issuer bid, 0.001 XRP)': (nft: TestNft): Promise<Result> => x.buyOffer(nft.id, nft.holderAddress ?? needRecipient(), '0.001') }),
      ...(flags & XRPL_FLAGS.burnable ? { 'Burn (issuer)': async (nft: TestNft): Promise<Result> => x.burn(nft.id, nft.holderAddress) } : {}),
    },
  };
  return type;
}

export const xrplTypes: NftType[] = [
  make('xrpl.transferable', 'Transferable', 'The baseline: a wallet should list it, send it, and handle offers in both directions.', XRPL_FLAGS.transferable, undefined),
  make('xrpl.nontransferable', 'Non-transferable', 'Only the issuer (the lab wallet) can move it: a holder cannot even offer it back (tefNFTOKEN_IS_NOT_TRANSFERABLE on the dry run). A wallet should show it as non-transferable. Return path: "Buy back from holder", then accept the bid in the wallet.', 0, undefined),
  make('xrpl.royalty', 'Royalty 5%', 'TransferFee 5000: the issuer takes 5 % of a priced sale (gifts pay nothing). A wallet should show the seller what they receive after the fee.', XRPL_FLAGS.transferable, transferFee(5)),
  make('xrpl.burnable', 'Burnable', 'tfBurnable: the issuer can burn it out of any holder. After a burn, a wallet should drop it and its offers on refresh.', XRPL_FLAGS.transferable | XRPL_FLAGS.burnable, undefined),
];
