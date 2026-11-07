// One interface per NFT type. A type exists because a wallet must treat it differently; `why` says how.
import type { TestNft } from './inventory';
import type { Chain, Holder, Result } from './pure';

export type ChainState = { holder: Holder; holderAddress?: string; fields: Record<string, string | number | boolean | null>; raw: unknown };
export type MintOpts = { to: 'self' | 'recipient'; uri: string; name: string };
export type NftType = {
  key: string; chain: Chain; label: string; why: string;
  mint(o: MintOpts): Promise<Result & { nft?: TestNft }>;
  /** To the recipient, or any pasted address. XRPL: a sell offer (gift, or priced). */
  transfer(nft: TestNft, to: string, o?: { priceXrp?: string; amount?: string }): Promise<Result>;
  explorer(nft: TestNft): string;
  readback(nft: TestNft): Promise<ChainState>;
  extra?: Record<string, (nft: TestNft) => Promise<Result>>;
};
