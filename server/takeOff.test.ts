import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU } from '../src/domain/menu.ts';
import { applyOverride } from '../src/domain/menuEdits.ts';
import { validatePush } from './validate.ts';

const SHOP = 'shop-a';
const event = (id: string, type: string, more: object) =>
  ({ id, shopId: SHOP, at: 1, orderNumber: 0, actor: { id: 'm', name: 'Manager', role: 'manager' }, type, ...more });

test('an item taken off the menu passes the server and the cloud; its own items by item_added null, starting ones by removed', () => {
  const ok = [
    event('a', 'menu.item_added', { itemId: 'new-egg-kottu', item: null }),
    event('b', 'menu.item_set', { itemId: 'margherita', before: {}, after: { removed: true } }),
    event('c', 'menu.item_set', { itemId: 'new-egg-kottu', before: { removed: true }, after: {} }),
  ];
  assert.ok(!('reason' in validatePush({ events: ok }, SHOP)));
  assert.ok('reason' in validatePush({ events: [event('d', 'menu.item_set', { itemId: 'margherita', before: {}, after: { removed: 'yes' } })] }, SHOP));
});

test('a taken-off item is kept for old orders but offered nowhere', () => {
  const margherita = MENU.find((m) => m.id === 'margherita')!;
  assert.deepEqual([applyOverride(margherita, { removed: true }, undefined, 0).hidden, applyOverride(margherita, { removed: true }, undefined, 0).removed], [true, true]);
  assert.equal(applyOverride(margherita, {}, undefined, 0).removed, undefined);
});
