// solc-js → src/chains/contracts.json { Name: { abi, bytecode } } for every contracts/*.sol. Run once, commit the output.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const solc = createRequire(import.meta.url)('solc');

const files = readdirSync('contracts').filter((f) => f.endsWith('.sol'));
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(files.map((f) => [f, { content: readFileSync(`contracts/${f}`, 'utf8') }])),
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const findImports = (p) => ({ contents: readFileSync(`node_modules/${p}`, 'utf8') });
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length) { console.error(errors.map((e) => e.formattedMessage).join('\n')); process.exit(1); }
const result = {};
for (const f of files) {
  const name = f.replace('.sol', '');
  const c = out.contracts[f][name];
  result[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}
writeFileSync('src/chains/contracts.json', JSON.stringify(result));
console.log('wrote src/chains/contracts.json:', Object.keys(result).join(', '));
