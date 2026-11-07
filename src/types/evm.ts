// The four EVM types, Base Sepolia (Arbitrum on mainnet). Indexers such as Alchemy list by Transfer events, so every contract emits Transfer at mint.
import * as e from '../chains/evm';
import { inventory, type TestNft } from '../inventory';
import { recipientAddress } from '../settings';
import { type ChainState, type MintOpts, type NftType } from '../types';
import { validAddress } from '../validate';

const needRecipient = () => { const t = recipientAddress('evm'); if (!t) throw new Error('set the recipient EVM address in the Recipient field on this page'); return t; };
const split = (id: string) => { const [c, t] = id.split(':'); return { contract: c as `0x${string}`, tokenId: BigInt(t) }; };
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const at = (n: TestNft): e.At => ({ address: split(n.id).contract, chainKey: n.network });
/** A revert (burned or nonexistent id) is a definite answer; any other read error rethrows, so the holder stays as known. */
const orOnRevert = <T>(fallback: T) => (err: unknown): T => { if (e.reverted(err)) return fallback; throw err; };
const holderOf = (owner: string): ChainState['holder'] => same(owner, e.address) ? 'playground' : same(owner, recipientAddress('evm')) ? 'recipient' : 'other';

type Spec = { key: string; label: string; why: string; contract: e.ContractName; standard: string; amount?: string;
  transferFn: (nft: TestNft, to: string, amount: string) => [string, unknown[]] };

function make(s: Spec): NftType {
  const is1155 = s.contract === 'Playground1155';
  return {
    key: s.key, chain: 'evm', label: s.label, why: s.why,
    explorer: (n) => `${e.chains[n.network]?.blockExplorers?.default.url}/token/${split(n.id).contract}?a=${split(n.id).tokenId}`,
    async mint(o: MintOpts) {
      const to = o.to === 'recipient' ? needRecipient() : e.address;
      if (!e.contractOf(s.contract)) { const d = await e.deployNamed(s.contract); if (d.status !== 'confirmed') return d; }
      const r = await e.writeNamed(s.contract, 'mint', is1155 ? [to, 5n, o.uri] : [to, o.uri]);
      if (r.status !== 'confirmed') return r;
      const ev = (r.logs ?? []).find((l: any) => l.eventName === 'Transfer' || l.eventName === 'TransferSingle');
      const tokenId = ev ? String(ev.args.tokenId ?? ev.args.id) : String((await e.readNamed(s.contract, is1155 ? 'nextId' : 'nextTokenId') as bigint) - 1n);
      const nft: TestNft = { chain: 'evm', type: s.key, network: e.chainKey(), id: `${e.contractOf(s.contract)}:${tokenId}`, name: o.name, uri: o.uri, mintedAt: Date.now(), mintTx: r.tx!,
        holder: o.to === 'recipient' ? 'recipient' : 'playground', holderAddress: to, amount: s.amount, log: [] };
      inventory.add(nft); inventory.log(nft.id, `mint to ${o.to}`, r);
      return { ...r, nft };
    },
    async transfer(nft, to, o) {
      if (!validAddress('evm', to)) return { status: 'refused', message: `${to} is not an EVM address (not broadcast)` };
      const amount = o?.amount || '1';
      if (is1155 && !/^[1-9]\d*$/.test(amount)) return { status: 'refused', message: `amount ${amount} must be a whole number, at least 1 (not broadcast)` };
      const [fn, args] = s.transferFn(nft, to, amount);
      return e.writeNamed(s.contract, fn, args, at(nft));
    },
    async readback(nft): Promise<ChainState> {
      const { contract, tokenId } = split(nft.id);
      if (is1155) {
        const recipient = recipientAddress('evm');
        const [mine, theirs, uri] = await Promise.all([e.readNamed(s.contract, 'balanceOf', [e.address, tokenId], at(nft)), recipient ? e.readNamed(s.contract, 'balanceOf', [recipient, tokenId], at(nft)) : 0n, e.readNamed(s.contract, 'uri', [tokenId], at(nft))]);
        const holder = (mine as bigint) > 0n ? 'playground' : (theirs as bigint) > 0n ? 'recipient' : 'other';
        return { holder, holderAddress: holder === 'playground' ? e.address : holder === 'recipient' ? recipient : undefined, raw: { mine: String(mine), recipient: String(theirs) }, fields: { standard: 'ERC-1155', contract, tokenId: String(tokenId), playgroundBalance: String(mine), recipientBalance: String(theirs), uri: String(uri) } };
      }
      const owner = await e.readNamed(s.contract, 'ownerOf', [tokenId], at(nft)).catch(orOnRevert('0x0')) as string;
      const uri = await e.readNamed(s.contract, 'tokenURI', [tokenId], at(nft)).catch(orOnRevert(null));
      return { holder: holderOf(owner), holderAddress: owner, raw: { owner, uri }, fields: { standard: s.standard, contract, tokenId: String(tokenId), owner, uri: uri == null ? null : String(uri) } };
    },
  };
}

export const evmTypes: NftType[] = [
  make({ key: 'evm.erc721', label: 'ERC-721', contract: 'PlaygroundNFT', standard: 'ERC-721', why: 'The baseline: indexers pick it up; a wallet should list it and send it.',
    transferFn: (n, to) => ['safeTransferFrom', [e.address, to, split(n.id).tokenId]] }),
  make({ key: 'evm.erc1155', label: 'ERC-1155 ×5', contract: 'Playground1155', standard: 'ERC-1155', amount: '5', why: 'Five copies of one id. A wallet should show the count and let the user choose how many to send.',
    transferFn: (n, to, amount) => ['safeTransferFrom', [e.address, to, split(n.id).tokenId, BigInt(amount), '0x']] }),
  make({ key: 'evm.punk', label: 'Non-standard (PunkLike)', contract: 'PunkLike', standard: 'none (transferPunk only)', why: 'No ERC-165, no safeTransferFrom. A wallet should not treat it as ERC-721 (safeTransferFrom reverts, burning gas); expected: "can\'t send here".',
    transferFn: (n, to) => ['transferPunk', [to, split(n.id).tokenId]] }),
  make({ key: 'evm.noop', label: 'No-op', contract: 'NoopNFT', standard: 'claims ERC-721', why: 'safeTransferFrom succeeds and moves nothing. A wallet should confirm the owner changed, not trust receipt.status alone. Readback here shows the truth.',
    transferFn: (n, to) => ['safeTransferFrom', [e.address, to, split(n.id).tokenId]] }),
];
