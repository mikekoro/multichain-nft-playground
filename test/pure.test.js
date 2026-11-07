// node --test: the rules that would silently break the tester. No browser, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XRPL_FLAGS, jsonLine, mergeHolder, queue, transferFee, xrplResult } from '../src/pure.ts';

test('XRPL engine codes map to the three states', () => {
  assert.equal(xrplResult('tesSUCCESS', 'H').status, 'confirmed');
  assert.equal(xrplResult('tecNO_DST', 'H').status, 'failed');
  assert.match(xrplResult('tecNO_DST', 'H').message, /fee spent/);
  for (const c of ['tefNFTOKEN_IS_NOT_TRANSFERABLE', 'temBAD_FEE', 'terQUEUED', 'telINSUF_FEE_P']) {
    assert.equal(xrplResult(c).status, 'refused', c);
    assert.equal(xrplResult(c).tx, undefined);
  }
});
test('TransferFee ×1000 and the flag bits', () => {
  assert.equal(transferFee(5), 5000);
  assert.equal(transferFee(0.01), 10);
  assert.throws(() => transferFee(51));
  assert.equal(XRPL_FLAGS.transferable | XRPL_FLAGS.burnable, 9);
});
test('a chain read never overwrites a known holder with unknown', () => {
  assert.equal(mergeHolder('recipient', 'unknown'), 'recipient');
  assert.equal(mergeHolder('recipient', 'playground'), 'playground');
  assert.equal(mergeHolder(undefined, 'unknown'), 'unknown');
});
test('queue runs one write per key at a time, in order, and survives a failure', async () => {
  const q = queue(); const order = [];
  const p1 = q('a', async () => { await new Promise((r) => setTimeout(r, 20)); order.push(1); });
  const p2 = q('a', async () => { order.push(2); throw new Error('x'); });
  const p3 = q('a', async () => { order.push(3); return 'ok'; });
  await p1; await assert.rejects(p2); assert.equal(await p3, 'ok');
  assert.deepEqual(order, [1, 2, 3]);
});

test('CLI output survives bigints', () => {
  assert.equal(jsonLine({ status: 'confirmed', id: 5n, nested: [1n] }), '{"status":"confirmed","id":"5","nested":["1"]}');
});
