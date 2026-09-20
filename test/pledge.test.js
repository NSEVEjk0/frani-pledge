// Frani Pledge — unit tests for condition evaluation and completion receipts.

import assert from 'node:assert/strict';
import { createKeyPair, signMessage, getPublicKey, randomHex } from '@unicitylabs/sphere-sdk';
import { toBaseUnits } from '../src/amounts.js';
import {
  createCampaign,
  addPledge,
  conditionMet,
  isExpired,
  totalPledgedBase,
  distinctPledgerCount,
  markSucceeded,
  STATUS,
} from '../src/pledge.js';
import { createCompletionReceipt, verifyCompletionReceipt } from '../src/receipt.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const kp = createKeyPair(randomHex(32));
const priv = kp.privateKey;
const pub = kp.publicKey || getPublicKey(priv);
const sign = (m) => signMessage(priv, m);

function countCampaign(target) {
  return createCampaign({
    title: 'Join up',
    condition: { type: 'count', target },
    coinId: 'UCT',
    network: 'testnet2',
  });
}

test('count condition not met until N distinct pledgers', () => {
  const c = countCampaign(3);
  assert.equal(conditionMet(c), false);
  addPledge(c, { pledger: 'a', amountBase: '100' });
  addPledge(c, { pledger: 'b', amountBase: '100' });
  assert.equal(conditionMet(c), false);
  addPledge(c, { pledger: 'c', amountBase: '100' });
  assert.equal(conditionMet(c), true);
  assert.equal(distinctPledgerCount(c), 3);
});

test('count condition ignores duplicate pledgers for distinctness', () => {
  const c = countCampaign(2);
  addPledge(c, { pledger: 'a', amountBase: '100' });
  addPledge(c, { pledger: 'a', amountBase: '100' });
  assert.equal(conditionMet(c), false);
  addPledge(c, { pledger: 'b', amountBase: '100' });
  assert.equal(conditionMet(c), true);
});

test('amount condition met when total reaches target', () => {
  const c = createCampaign({
    title: 'Fund it',
    condition: { type: 'amount', target: toBaseUnits('10', 8) },
    coinId: 'UCT',
    network: 'testnet2',
  });
  addPledge(c, { pledger: 'a', amountBase: toBaseUnits('4', 8) });
  assert.equal(conditionMet(c), false);
  addPledge(c, { pledger: 'b', amountBase: toBaseUnits('6', 8) });
  assert.equal(conditionMet(c), true);
  assert.equal(totalPledgedBase(c), toBaseUnits('10', 8));
});

test('isExpired respects the deadline', () => {
  const c = countCampaign(1);
  c.expiresAt = Date.now() - 1000;
  assert.equal(isExpired(c), true);
  c.expiresAt = Date.now() + 100000;
  assert.equal(isExpired(c), false);
  c.expiresAt = null;
  assert.equal(isExpired(c), false);
});

test('createCampaign rejects bad condition', () => {
  assert.throws(() => createCampaign({ condition: { type: 'weird', target: 1 }, network: 'testnet2' }));
  assert.throws(() => createCampaign({ condition: { type: 'count', target: 0 }, network: 'testnet2' }));
});

test('completion receipt verifies and detects tampering', () => {
  const c = countCampaign(1);
  addPledge(c, { pledger: 'ab'.repeat(33), amountBase: toBaseUnits('5', 8) });
  markSucceeded(c);
  const receipt = createCompletionReceipt({ campaign: c, pledge: c.pledges[0], sign, signerPubkey: pub });
  assert.equal(verifyCompletionReceipt(receipt).ok, true);
  receipt.amountBase = '1';
  assert.equal(verifyCompletionReceipt(receipt).ok, false);
});

test('new campaign starts open', () => {
  assert.equal(countCampaign(2).status, STATUS.OPEN);
});

console.log(`\n${passed} checks passed.`);
