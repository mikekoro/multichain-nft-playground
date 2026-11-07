// Generates one throwaway testnet key per chain into .env.local. Refuses to overwrite.
import { existsSync, writeFileSync } from 'node:fs';
import { Wallet } from 'xrpl';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Keypair as SolKeypair } from '@solana/web3.js';
import { Keypair as StellarKeypair } from '@stellar/stellar-sdk';

if (existsSync('.env.local')) {
  console.error('.env.local exists; delete it first if you really want new wallets');
  process.exit(1);
}
const xrpl = Wallet.generate();
const spare = Wallet.generate(); // never funded: the unactivated destination for negative tests
const evmKey = generatePrivateKey();
const sol = SolKeypair.generate();
const stellar = StellarKeypair.random();

writeFileSync('.env.local', [
  `VITE_XRPL_SEED=${xrpl.seed}`,
  `VITE_XRPL_SPARE=${spare.classicAddress}`,
  `VITE_EVM_KEY=${evmKey}`,
  `VITE_SOLANA_SECRET=${Buffer.from(sol.secretKey).toString('base64')}`,
  `VITE_STELLAR_SECRET=${stellar.secret()}`,
  '',
].join('\n'));

console.log('wrote .env.local');
console.log('XRPL    ', xrpl.classicAddress);
console.log('XRPL spare (unfunded)', spare.classicAddress);
console.log('EVM     ', privateKeyToAccount(evmKey).address);
console.log('Solana  ', sol.publicKey.toBase58());
console.log('Stellar ', stellar.publicKey());
