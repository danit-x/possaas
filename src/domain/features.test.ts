import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFeatures, DEFAULT_FEATURES, features, PARTS, sameFeatures, setFeatures } from './features.ts';

test('every part has a name, a line and a default; two kitchens waits, the rest are on as before', () => {
  assert.deepEqual(PARTS.map((p) => p.key).sort(), Object.keys(DEFAULT_FEATURES).sort());
  assert.equal(DEFAULT_FEATURES.twoKitchens, false);
  assert.equal(DEFAULT_FEATURES.cashOut, true);
});

test('only known parts, as true or false, survive a settings file or an answer', () => {
  assert.deepEqual(cleanFeatures({ twoKitchens: true, cashOut: 'yes', rocket: true }), { twoKitchens: true });
  assert.deepEqual(cleanFeatures(null), {});
  assert.deepEqual(cleanFeatures([true]), {});
});

test('what is not set is at its default: {} is the same as every default spelled out', () => {
  assert.equal(sameFeatures({}, DEFAULT_FEATURES), true);
  assert.equal(sameFeatures({ twoKitchens: true }, {}), false);
  setFeatures({ busyMode: false });
  assert.equal(features().busyMode, false);
  assert.equal(features().cashOut, true);
  setFeatures(undefined);
  assert.deepEqual(features(), DEFAULT_FEATURES);
});
