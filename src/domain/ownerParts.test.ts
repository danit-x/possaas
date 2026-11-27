import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMorning } from './menuEdits.ts';
import { ownerParts } from './ownerParts.ts';
import type { SyncEvent } from './sync.ts';

// The owner's sidebar lines (SCRUM-131): what is going on in each part, and a badge only for decisions.

const NOW = new Date(2026, 9, 23, 14, 0).getTime();
const owner = { id: 'o', name: 'Owner', role: 'owner' as const };
const base = { shopId: 's', actor: owner };
const sent = (n: number, itemId: string, size?: 'M' | 'L'): SyncEvent =>
  ({ ...base, id: `s${n}`, at: NOW - 3600_000, orderNumber: n, type: 'order.sent', ticketId: `t${n}`, addOn: false,
    lines: [{ id: `l${n}`, itemId, qty: 1, size, adds: [], outs: [] }] });
const paid = (n: number, total: number): SyncEvent =>
  ({ ...base, id: `p${n}`, at: NOW - 3000_000, orderNumber: n, type: 'order.paid', total, tender: 'cash', tendered: total });
const cashOut = (id: string, name: string, amount: number, at = NOW - 600_000): SyncEvent =>
  ({ ...base, id, at, orderNumber: 0, type: 'cash.out', name, amount });

test('a quiet shop: every part says what is there, nothing has a badge', () => {
  const parts = ownerParts([], NOW);
  assert.deepEqual(Object.keys(parts), ['sell', 'owner', 'cashout', 'menu', 'customers', 'setup']);
  assert.equal(parts.owner.preview, 'No sales yet today');
  assert.equal(parts.cashout.preview, 'Nothing out today');
  assert.equal(parts.menu.preview, 'Prices, names, sold out');
  assert.equal(parts.sell.preview, 'The register');
  assert.ok(Object.values(parts).every((p) => p.badge === 0));
});

test("today's takings", () => {
  const parts = ownerParts([sent(1, 'margherita', 'L'), paid(1, 199000), sent(2, 'margherita', 'M'), paid(2, 145000)], NOW);
  assert.equal(parts.owner.preview, 'Rs 3,440 · 2 orders');
});

test("cash out: today's lines (5 am to 5 am) add up; a line taken off does not count", () => {
  const fish = cashOut('c1', 'Fish', 450000);
  const off: SyncEvent = { ...base, id: 'u1', at: NOW - 60_000, orderNumber: 0, type: 'cash.out_undone', undoneEventId: 'c2' };
  const parts = ownerParts([fish, cashOut('c2', 'Gas', 300000), off, cashOut('old', 'Bank', 2000000, NOW - 86_400_000)], NOW);
  assert.equal(parts.cashout.preview, 'Rs 4,500 out today');
  assert.equal(parts.cashout.badge, 0);
});

test('menu: an item sold out shows', () => {
  const soldOut: SyncEvent = { ...base, id: 'so', at: NOW - 600_000, orderNumber: 0, type: 'menu.sold_out', itemId: 'seafood', until: nextMorning(NOW) };
  assert.equal(ownerParts([soldOut], NOW).menu.preview, 'Seafood sold out today');
});
