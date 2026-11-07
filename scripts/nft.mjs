// The playground without a browser: the same chain modules through Vite SSR, printing one JSON line, for scripts.
// Testnet by default, mainnet only with --mainnet. Contract state is carried in .testnet-state.local / .mainnet-state.local
// (the browser's localStorage, exported; missing = empty, so contracts get deployed afresh).
// A result can't be trusted on a timeout (a write can say "not broadcast" after broadcasting): ask the chain.
// usage: node scripts/nft.mjs [--mainnet] <addresses|balances|types|mint|transfer|offer|bid|accept|cancel|burn|offers|readback> ...
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createServer, loadEnv } from 'vite';
import { jsonLine } from '../src/pure.ts';

const out = (o) => console.log(jsonLine(o));
const str = { type: 'string' };
let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { mainnet: { type: 'boolean' }, to: str, name: str, sample: str, uri: str, amount: str, price: str, expires: str, holder: str } });
} catch (e) { out({ status: 'error', message: e.message }); process.exitCode = 1; }
const { values: flags = {}, positionals: [command, ...args] = [] } = parsed ?? {};
// Set before Vite loads .env*: an env var that already exists wins over the files, so .env.local can't flip the network.
process.env.VITE_NETWORK = flags.mainnet ? 'mainnet' : 'testnet';

const STATE = flags.mainnet ? '.mainnet-state.local' : '.testnet-state.local';
const store = new Map(existsSync(STATE) ? Object.entries(JSON.parse(readFileSync(STATE, 'utf8'))) : []);
const save = () => writeFileSync(STATE, JSON.stringify(Object.fromEntries(store)));
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); save(); },
  removeItem: (k) => { store.delete(k); save(); },
};

const server = parsed && await createServer({ mode: flags.mainnet ? 'mainnet' : 'development', configFile: false, root: process.cwd(), appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
// Same check as main.tsx: the chain modules parse their keys on load, so a missing one would crash with an unclear error.
const missing = server && ['VITE_XRPL_SEED', 'VITE_XRPL_SPARE', 'VITE_EVM_KEY', 'VITE_SOLANA_SECRET', 'VITE_STELLAR_SECRET'].filter((k) => !loadEnv(server.config.mode, process.cwd(), 'VITE_')[k]);

const FAMILY = { xrpl: 'xrpl', evm: 'evm', solana: 'solana', stellar: 'stellar' };

async function nftRecord(id) {
  const { inventory } = await load('/src/inventory.ts');
  const nft = inventory.list().find((n) => n.id === id);
  if (!nft) throw new Error(`${id} isn't in the inventory`);
  return nft;
}

/** A type key such as `soroban.standard`, or an error that lists them: a bad key used to crash on `undefined.transfer`. */
async function needType(key) {
  const { typeOf, TYPES } = await load('/src/registry.ts');
  const type = typeOf(key);
  if (!type) throw new Error(`Unknown type ${key}: the first argument is one of ${TYPES.map((t) => t.key).join(', ')}`);
  return type;
}

const commands = {
  async addresses() {
    const [x, e, s, st] = await Promise.all(['xrpl', 'evm', 'solana', 'stellar'].map((c) => load(`/src/chains/${c}.ts`)));
    return { xrpl: x.address, evm: e.address, solana: s.address, stellar: st.address };
  },
  async balances() {
    const [x, e, s, st] = await Promise.all(['xrpl', 'evm', 'solana', 'stellar'].map((c) => load(`/src/chains/${c}.ts`)));
    return { xrpl: await x.balance(), [e.chainKey()]: await e.balance(), solana: await s.balance(), stellar: await st.balance() };
  },
  async types() {
    return (await load('/src/registry.ts')).TYPES.map((t) => t.key);
  },
  /** mint <type> --to <address|self> [--name N] [--sample 0-5 | --uri U] */
  async mint([key]) {
    const type = await needType(key);
    const { metaBase, set } = await load('/src/settings.ts');
    if (flags.to && flags.to !== 'self') set(`recipient.${FAMILY[type.chain]}`, flags.to);
    const uri = flags.uri ?? `${metaBase()}/${(Number(flags.sample ?? 0) % 6) + 1}.json`;
    const r = await type.mint({ to: flags.to && flags.to !== 'self' ? 'recipient' : 'self', uri, name: flags.name ?? `${type.label} ${Date.now()}` });
    return { status: r.status, tx: r.tx, code: r.code, message: r.message, nftId: r.nft?.id, holderAddress: r.nft?.holderAddress };
  },
  /** transfer <type> <nftId> <to> [--amount n] */
  async transfer([key, id, to]) {
    return (await needType(key)).transfer(await nftRecord(id), to, { amount: flags.amount });
  },
  async readback([key, id]) {
    const r = await (await needType(key)).readback(await nftRecord(id));
    return { holder: r.holder, holderAddress: r.holderAddress, fields: r.fields };
  },
  /** offer <nftId> <to> [--price xrp] [--expires seconds] */
  async offer([id, to]) {
    const x = await load('/src/chains/xrpl.ts');
    if (!flags.expires) return x.sellOffer(id, to, flags.price ?? '0');
    const { isoTimeToRippleTime, xrpToDrops } = await import('xrpl');
    return x.submit({ TransactionType: 'NFTokenCreateOffer', Account: x.address, NFTokenID: id, Flags: 1, Destination: to,
      Amount: Number(flags.price ?? 0) > 0 ? xrpToDrops(flags.price) : '0', Expiration: isoTimeToRippleTime(new Date(Date.now() + Number(flags.expires) * 1000).toISOString()) });
  },
  /** bid <nftId> <holder> <xrp> */
  async bid([id, holder, xrp]) {
    return (await load('/src/chains/xrpl.ts')).buyOffer(id, holder, xrp);
  },
  async offers() {
    const x = await load('/src/chains/xrpl.ts');
    return { mine: await x.myOffers(), incoming: await x.incomingOffers() };
  },
  /** accept <offerId> */
  async accept([index]) {
    const x = await load('/src/chains/xrpl.ts');
    const all = [...await x.myOffers(), ...await x.incomingOffers()];
    const offer = all.find((o) => o.index === index);
    if (!offer) throw new Error(`Offer ${index} isn't aimed at the playground`);
    return x.accept(offer);
  },
  async cancel([index]) {
    return (await load('/src/chains/xrpl.ts')).cancel(index);
  },
  /** burn <nftId> [--holder address]: the issuer burning out of a holder, burnable only */
  async burn([id]) {
    return (await load('/src/chains/xrpl.ts')).burn(id, flags.holder);
  },
};

if (server) {
  try {
    if (missing.length) throw new Error(`Missing ${missing.join(', ')}. Run npm run wallets first`);
    if (!commands[command]) throw new Error(`Unknown command ${command}`);
    out(await commands[command](args));
  } catch (e) {
    process.exitCode = 1;
    out({ status: 'error', message: String(e?.message ?? e).slice(0, 400) });
  }
  // No process.exit (it can cut piped stdout short): close what holds the event loop open instead.
  if (!missing.length) await load('/src/chains/xrpl.ts').then((x) => x.disconnect(), () => {});
  await server.close();
}
