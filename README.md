# Multichain NFT Lab

A local web app (and `scripts/nft.mjs` CLI) that mints test NFTs of 15 edge-case types on XRPL, EVM, Solana and Stellar/Soroban and sends them to a wallet under test.

**Warning:** the keys are in the bundle, so never deploy this; mainnet mode (`VITE_NETWORK=mainnet`, CLI `--mainnet`) spends real funds.

## Setup

Needs Node 22.18 or newer (`nvm use` reads `.nvmrc`). Docker only if you rebuild the Soroban contract.

```
npm install
npm run wallets   # writes throwaway testnet keys to .env.local and prints the four addresses
npm run dev       # http://127.0.0.1:5174
npm test
```

`npm run wallets` refuses to overwrite an existing `.env.local`. Keys stay local: `*.local` is gitignored.

## First run

1. **Fund the four wallets.** Each Overview card has the address (copy or QR). Testnet faucets:
   - XRPL: [XRP faucets](https://xrpl.org/resources/xrp-faucets) (Testnet). Recommended 5 XRP or more.
   - EVM (Base Sepolia): any faucet from [Base's faucet list](https://docs.base.org/base-chain/tools/network-faucets). Recommended 0.001 ETH or more.
   - Solana (Devnet): [faucet.solana.com](https://faucet.solana.com). Recommended 0.1 SOL or more.
   - Stellar (Testnet): Friendbot, `https://friendbot.stellar.org/?addr=<your G… address>`. Recommended 20 XLM or more.
2. **Set the recipient** per chain: the wallet you are testing. "Set recipient" on Overview or the pencil on a chain page.
3. **Mint** from a chain page: pick a type, a sample image and a destination, or "Mint all" to the recipient. EVM and Soroban contracts are deployed on the first mint (or from the Contracts tab).

## NFT images and metadata

They must be public: wallets fetch them themselves. The six samples in `public/samples/` are served from this repo on GitHub (raw.githubusercontent.com), so a fork works once it is public and pushed. For your own images, commit them there and push, or host them anywhere public (or `ipfs://`), then paste the JSON URL into the Mint card (CLI: `--uri`). To move all samples elsewhere: `npm run samples -- https://host/samples` and set the base URL in Settings.

## CLI

The same chain code without a browser, one JSON line per command:

```
node scripts/nft.mjs addresses
node scripts/nft.mjs types
node scripts/nft.mjs mint xrpl.transferable --to self --sample 2
```

All commands are listed at the top of `scripts/nft.mjs`.

## Configuration and troubleshooting

RPC endpoints are public defaults in `.env`; override any of them in `.env.local`. If a balance shows "connect() timed out" or another RPC error, the public endpoint is down or slow: point that chain at another provider.

Compressed Solana NFTs need a DAS-capable RPC (e.g. Helius) in `VITE_SOLANA_DAS_RPC`; without it they can't be read or sent.

The Soroban contract ships prebuilt as `public/playground_nft.wasm`; `npm run build:soroban` rebuilds it (Docker).

MIT, see [LICENSE](LICENSE). Uses OpenZeppelin Contracts and Stellar Contracts (MIT) and soroban-sdk (Apache-2.0).
