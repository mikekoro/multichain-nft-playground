import { Client, Wallet, convertHexToString, convertStringToHex, xrpToDrops, dropsToXrp, type SubmittableTransaction } from 'xrpl';
import { endpoint, env, MAINNET, type Nft } from '../settings';
import { queue, xrplResult, type Result } from '../pure';

export const wallet = Wallet.fromSeed(env.VITE_XRPL_SEED);
export const address = wallet.classicAddress;
export const spare = env.VITE_XRPL_SPARE as string;
export const explorerBase = MAINNET ? 'https://livenet.xrpl.org' : 'https://testnet.xrpl.org';
export const explorer = `${explorerBase}/accounts/${address}`;

let client: Client | null = null;
async function c() {
  if (!client) client = new Client(endpoint('XRPL_RPC'));
  if (!client.isConnected()) await client.connect();
  return client;
}
/** For Node callers (the CLI): the open socket otherwise keeps the process alive. */
export const disconnect = async () => { if (client?.isConnected()) await client.disconnect(); };

export async function balance() {
  try { return `${await (await c()).getXrpBalance(address)} XRP`; }
  catch (e: any) { if (e?.data?.error === 'actNotFound') return 'unfunded (actNotFound)'; throw e; }
}
export const fund = MAINNET ? undefined : async () => {
  const r = await (await c()).fundWallet(wallet);
  return `faucet ok, balance ${r.balance} XRP`;
};

const q = queue();
export type XrplResult = Result & { nftId?: string };

/** Every write: autofill → simulate → sign → submitAndWait, one at a time per account. A non-tes simulate is
 *  refused with no hash (nothing broadcast). tec* = applied, fee spent. tef/tem/ter thrown by submitAndWait = refused. */
export function submit(tx: SubmittableTransaction): Promise<XrplResult> {
  return q(address, async () => {
    const cl = await c();
    try {
      const filled = await cl.autofill(tx);
      const sim: any = await cl.simulate(filled);
      const simCode: string = sim?.result?.engine_result ?? 'unknown';
      if (simCode !== 'tesSUCCESS') return { status: 'refused', code: simCode, message: `${simCode}: ${sim?.result?.engine_result_message ?? 'simulate did not succeed'} (simulated, not broadcast)` };
      const r = await cl.submitAndWait(filled, { wallet });
      const meta = r.result.meta;
      const code = typeof meta === 'object' ? meta.TransactionResult : 'unknown';
      const out: XrplResult = xrplResult(code, r.result.hash);
      if (typeof meta === 'object' && 'nftoken_id' in meta) out.nftId = (meta as any).nftoken_id;
      return out;
    } catch (e: any) {
      const code = e?.data?.error ?? e?.data?.engine_result ?? (typeof e?.message === 'string' && /^te[a-z]/i.test(e.message) ? e.message.split(/[ :]/)[0] : 'error');
      return xrplResult(code, undefined, e?.data?.error_message ?? e?.data?.engine_result_message ?? e?.message ?? String(e));
    }
  });
}

export const hexUri = (uri: string) => {
  const hex = convertStringToHex(uri);
  if (hex.length > 512) throw new Error(`URI is ${hex.length / 2} bytes, max 256`);
  return hex;
};

export function mint(o: { uri: string; flags: number; taxon?: number; transferFee?: number }) {
  return submit({
    TransactionType: 'NFTokenMint', Account: address, URI: hexUri(o.uri), NFTokenTaxon: o.taxon ?? 0, Flags: o.flags,
    ...(o.transferFee ? { TransferFee: o.transferFee } : {}),
  });
}
/** Issuer burns a burnable token from any holder (Owner = the holder when it isn't us). */
export const burn = (nftId: string, holder?: string) => submit({
  TransactionType: 'NFTokenBurn', Account: address, NFTokenID: nftId, ...(holder && holder !== address ? { Owner: holder } : {}),
});

// ponytail: XRPL lists ignore pagination markers; follow result.marker if an account exceeds 400 NFTs/objects
/** account_nfts of any account; [] for an unactivated one. */
export async function nftsOf(account: string) {
  try {
    const r = await (await c()).request({ command: 'account_nfts', account, limit: 400 });
    return r.result.account_nfts;
  } catch (e: any) { if (e?.data?.error === 'actNotFound') return []; throw e; }
}

export async function owned(): Promise<Nft[]> {
  return (await nftsOf(address)).map((n) => ({
    id: n.NFTokenID,
    uri: n.URI ? convertHexToString(n.URI) : undefined,
    note: `${(n.Flags & 8) ? 'transferable' : 'NON-transferable'}${(n.Flags & 1) ? ', burnable' : ''}${(n as any).TransferFee ? `, fee ${(n as any).TransferFee / 1000}%` : ''}, taxon ${n.NFTokenTaxon}`,
  }));
}
export { convertHexToString };

/** Sell offer. amountXrp 0 + Destination = the standard gift. */
export const sellOffer = (nftId: string, to: string, amountXrp: string) => submit({
  TransactionType: 'NFTokenCreateOffer', Account: address, NFTokenID: nftId, Flags: 1,
  Amount: amountXrp && Number(amountXrp) > 0 ? xrpToDrops(amountXrp) : '0', Destination: to,
});
/** Buy offer (bid) on someone else's NFT. tx `Owner` = current holder. */
export const buyOffer = (nftId: string, holder: string, amountXrp: string) => submit({
  TransactionType: 'NFTokenCreateOffer', Account: address, NFTokenID: nftId, Owner: holder, Amount: xrpToDrops(amountXrp),
});
export const cancel = (index: string) => submit({ TransactionType: 'NFTokenCancelOffer', Account: address, NFTokenOffers: [index] });
export const accept = (o: Offer) => submit({
  TransactionType: 'NFTokenAcceptOffer', Account: address,
  ...(o.kind === 'sell' ? { NFTokenSellOffer: o.index } : { NFTokenBuyOffer: o.index }),
});

export type Offer = { index: string; nftId: string; kind: 'sell' | 'buy'; amount: string; owner: string; destination?: string };
const fmt = (a: any) => typeof a === 'string' ? `${dropsToXrp(a)} XRP` : JSON.stringify(a);
const toOffer = (o: any, nftId: string): Offer => ({
  index: o.index ?? o.nft_offer_index, nftId, kind: (o.Flags ?? o.flags ?? 0) & 1 ? 'sell' : 'buy',
  amount: fmt(o.Amount ?? o.amount), owner: o.Owner ?? o.owner, destination: o.Destination ?? o.destination,
});

/** Offers this account created, straight from the ledger. */
export async function myOffers(): Promise<Offer[]> {
  try {
    const r = await (await c()).request({ command: 'account_objects', account: address, type: 'nft_offer', limit: 400 });
    return r.result.account_objects.map((o: any) => toOffer(o, o.NFTokenID));
  } catch (e: any) { if (e?.data?.error === 'actNotFound') return []; throw e; }
}

const offersFor = async (command: 'nft_sell_offers' | 'nft_buy_offers', nftId: string) => {
  try { return ((await (await c()).request({ command, nft_id: nftId } as any)).result as any).offers as any[]; }
  catch (e: any) { if (e?.data?.error === 'objectNotFound') return []; throw e; }
};

/** Offers aimed at this account: sell offers with Destination=me (found via account_tx, which indexes Destination)
 *  and bids on tokens I hold (nft_buy_offers per token; account_tx never sees those). Liveness confirmed on the ledger. */
export async function incomingOffers(): Promise<Offer[]> {
  const cl = await c();
  const ids = new Set<string>();
  try {
    const r = await cl.request({ command: 'account_tx', account: address, limit: 200 });
    for (const e of r.result.transactions as any[]) {
      const t = e.tx_json ?? e.tx;
      if (t?.TransactionType === 'NFTokenCreateOffer' && t.Destination === address && t.Account !== address) ids.add(t.NFTokenID);
    }
  } catch (e: any) { if (e?.data?.error !== 'actNotFound') throw e; }
  const out: Offer[] = [];
  for (const id of ids) {
    for (const o of await offersFor('nft_sell_offers', id)) if (o.destination === address) out.push(toOffer({ ...o, Flags: 1 }, id));
  }
  for (const n of await owned()) {
    for (const o of await offersFor('nft_buy_offers', n.id)) if (o.owner !== address) out.push(toOffer({ ...o, Flags: 0 }, n.id));
  }
  return out;
}
