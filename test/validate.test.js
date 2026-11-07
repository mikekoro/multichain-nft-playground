// node --test: one valid and one invalid address per chain, through the SDK validators. Loads without .env.local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressError, validAddress } from '../src/validate.ts';

const cases = {
  xrpl: ['rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTx'],
  evm: ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD'], // bad checksum
  solana: ['11111111111111111111111111111111', '0OIl111111111111111111111111111'],
  stellar: ['GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7', 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN8'],
};
test('each chain accepts its own address and refuses a broken one', () => {
  for (const [chain, [good, bad]] of Object.entries(cases)) {
    assert.ok(validAddress(chain, good), `${chain} ${good}`);
    assert.ok(!validAddress(chain, bad), `${chain} ${bad}`);
  }
  assert.ok(validAddress('stellar', 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE'), 'Soroban contract');
  assert.ok(!validAddress('evm', cases.xrpl[0]), 'another chain\'s address');
});
test('the inline hint stays quiet while a field is empty or valid', () => {
  assert.equal(addressError('xrpl', ''), undefined);
  assert.equal(addressError('xrpl', ` ${cases.xrpl[0]} `), undefined);
  assert.match(addressError('xrpl', 'nope'), /not a valid xrpl/);
});
