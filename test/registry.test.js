// The type registry's invariants, read from the source without loading chain SDKs (they parse keys on load).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Each `make(` call: its key, and its why (the 3rd positional string on XRPL, a `why:` field elsewhere).
const types = ['xrpl', 'evm', 'solana', 'soroban'].flatMap((f) => readFileSync(new URL(`../src/types/${f}.ts`, import.meta.url), 'utf8')
  .split(/\n\s+make\(/).slice(1).map((c) => ({ file: f, key: c.match(/'([a-z]+\.[a-z0-9]+)'/)?.[1], why: c.match(/why: '(.+?)'(?:,|\s*\})|^'[^']+', '[^']+', '(.+?)', /)?.slice(1).find(Boolean) })));
test('15 types, unique keys prefixed by their chain', () => {
  assert.equal(types.length, 15);
  assert.equal(new Set(types.map((t) => t.key)).size, 15);
  for (const t of types) assert.ok(t.key?.startsWith(t.file === 'solana' ? 'sol.' : `${t.file}.`), `${t.file}: ${t.key}`);
});
test('every type says what a wallet should do with it', () => {
  for (const t of types) assert.ok(t.why?.length > 20, `${t.key} has no why`);
});
