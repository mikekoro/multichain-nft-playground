// The Stellar account: funding and balance. NFTs are Soroban contracts (see soroban.ts); classic assets were dropped.
import { Horizon, Keypair } from '@stellar/stellar-sdk';
import { endpoint, env, MAINNET } from '../settings';
import { queue } from '../pure';

const server = new Horizon.Server(endpoint('STELLAR_HORIZON'));
const kp = Keypair.fromSecret(env.VITE_STELLAR_SECRET);
export const address = kp.publicKey();
export const explorer = `https://stellar.expert/explorer/${MAINNET ? 'public' : 'testnet'}/account/${address}`;
/** One in-flight transaction per account: Soroban and any future classic writes share the sequence number. */
export const q = queue();

export async function balance() {
  try { return `${(await server.loadAccount(address)).balances.find((b) => b.asset_type === 'native')?.balance} XLM`; }
  catch (e: any) { if (e?.response?.status === 404) return 'unfunded'; throw e; }
}
export const fund = MAINNET ? undefined : async () => {
  const r = await fetch(`${endpoint('STELLAR_FRIENDBOT')}?addr=${address}`);
  return r.ok ? 'friendbot ok' : `friendbot failed: ${r.status}`;
};
