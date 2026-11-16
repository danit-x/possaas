import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoHistory } from '../fake/history.ts';
import { rulesSuggestions, salesFrom, type ShopData } from './insights.ts';
import { SEED_INVENTORY, SEED_SUPPLIERS } from './inventoryData.ts';
import type { SyncEvent } from './sync.ts';

const stock = { items: SEED_INVENTORY, suppliers: SEED_SUPPLIERS };
const friday = new Date(2026, 9, 9, 20, 30).getTime(); // a Friday evening, local time
const ids = (data: ShopData) => rulesSuggestions.insights(data).map((i) => i.id);

const actor = { id: 'n', name: 'Nimal', role: 'cashier' as const };
const paid = (orderNumber: number, at: number, total: number): SyncEvent =>
  ({ type: 'order.paid', id: `p${orderNumber}-${at}`, shopId: 's', at, actor, orderNumber, total, tender: 'cash', tendered: total });

test('the demo Friday: only what sales and staff say, decisions first, good news last', () => {
  const insights = rulesSuggestions.insights({ events: demoHistory(friday), now: friday, stock });
  // No stock, tables, cameras or recipes in Bata Kade's POS: none of their cards.
  assert.deepEqual(insights.map((i) => i.id), ['sales-vs-usual', 'voids', 'kitchen-slow', 'not-selling', 'best-seller']);
  const [sales, voids, kitchen, idle] = insights;
  assert.match(sales.title, /^Sales \d+% below a usual Friday$/);
  assert.match(voids.title, /voids today, \d+ by Ravi$/);
  assert.ok(voids.action.items.every((i) => i.secondary?.startsWith('Ravi')), 'each void says who and why');
  assert.match(kitchen.detail, /Usually \d+ min/);
  assert.equal(idle.title, "Watalappan hasn't sold in 2 weeks");
});

test('made food changed or cancelled at the counter: a card from the first one, gone after its Undo', () => {
  const today = new Date(friday); today.setHours(0, 0, 0, 0);
  const t = today.getTime() + 3_600_000;
  const burger = { id: 'l1', itemId: 'chicken-burger', qty: 2, adds: [], outs: [], sent: true, unit: 65000 };
  const audit = { shopId: 's', actor, orderNumber: 42, totalBefore: 130000, totalAfter: 0 };
  const cancelled: SyncEvent = { ...audit, id: 'c1', at: t, type: 'order.item_cancelled', lineId: 'l1', index: 0, before: burger, reason: 'Already made', made: true };
  const notMade: SyncEvent = { ...audit, id: 'c2', at: t, type: 'order.item_cancelled', lineId: 'l2', index: 0, before: { ...burger, id: 'l2' }, reason: 'Before it was made' };
  const card = rulesSuggestions.insights({ events: [paid(1, t, 100000), cancelled, notMade], now: friday, stock }).find((i) => i.id === 'made-thrown');
  assert.equal(card?.title, '1 made item thrown away today');
  assert.match(card?.detail ?? '', /^Rs 1,300 of food/);
  assert.deepEqual(card?.action.items.map((i) => i.secondary), ['Nimal · cancelled']);
  const undone: SyncEvent = { ...audit, id: 'u1', at: t + 1, type: 'order.change_undone', undoneEventId: 'c1', undoneType: 'order.item_cancelled' };
  assert.ok(!ids({ events: [paid(1, t, 100000), cancelled, undone], now: friday, stock }).includes('made-thrown'));
});

test('the summary counts today only, and a payment undone does not count', () => {
  const today = new Date(friday); today.setHours(0, 0, 0, 0);
  const events: SyncEvent[] = [
    paid(1, today.getTime() - 1000, 999900), // yesterday
    paid(2, today.getTime() + 3_600_000, 250000),
    paid(3, today.getTime() + 7_200_000, 150000),
    { type: 'order.payment_undone', id: 'u3', shopId: 's', at: today.getTime() + 7_300_000, actor, orderNumber: 3 },
  ];
  assert.deepEqual(rulesSuggestions.summary({ events, now: friday }), { salesCents: 250000, orders: 1, averageCents: 250000 });
  assert.equal(salesFrom(events).length, 2);
});

test('order numbers repeat (each screen counts from 1001): every payment is its own sale', () => {
  const today = new Date(friday); today.setHours(0, 0, 0, 0);
  const t = today.getTime();
  const undo = (orderNumber: number, at: number): SyncEvent =>
    ({ type: 'order.payment_undone', id: `u${orderNumber}-${at}`, shopId: 's', at, actor, orderNumber });
  const events: SyncEvent[] = [
    paid(1001, t + 1_000_000, 200000), // the counter
    paid(1001, t + 2_000_000, 300000), // the same number again, e.g. after a reset or from a second screen
    paid(1002, t + 3_000_000, 100000),
    undo(1002, t + 3_100_000), // Undo, then paid again: still one sale
    paid(1002, t + 3_200_000, 120000),
    paid(1003, t + 4_000_000, 50000),
    undo(1003, t + 4_100_000), // undone for good
  ];
  assert.deepEqual(rulesSuggestions.summary({ events, now: friday }), { salesCents: 620000, orders: 3, averageCents: 206667 });
  assert.deepEqual(salesFrom(events).map((s) => s.total), [200000, 300000, 120000]);
});

test('a paid order changed afterwards (SCRUM-242): the difference adds to its sale, never a sale of its own', () => {
  const t = new Date(friday).setHours(0, 0, 0, 0);
  const settled = (orderNumber: number, at: number, amount: number): SyncEvent =>
    ({ type: 'order.settled', id: `s${orderNumber}-${at}`, shopId: 's', at, actor, orderNumber, amount, tender: 'cash', tendered: Math.abs(amount) });
  const events: SyncEvent[] = [
    paid(1001, t + 1_000_000, 145000),
    settled(1001, t + 1_100_000, 60000), // Medium to Large: paid Rs 600 more
    paid(1002, t + 2_000_000, 200000),
    settled(1002, t + 2_100_000, -45000), // a burger taken off: Rs 450 back
  ];
  assert.deepEqual(salesFrom(events).map((s) => s.total), [205000, 155000]);
  assert.equal(rulesSuggestions.summary({ events, now: friday }).orders, 2);
});

test('a new shop: no history, so no "usual" to compare with, and no false alarms', () => {
  const day = new Date(friday); day.setHours(0, 0, 0, 0);
  const events = Array.from({ length: 30 }, (_, i) => paid(i + 1, day.getTime() + (12 * 60 + i) * 60_000, 300000));
  assert.deepEqual(ids({ events, now: friday, stock }), []);
});

test('sales well above usual is good news; within 20% says nothing', () => {
  const day = new Date(friday); day.setHours(0, 0, 0, 0);
  const at = (weeks: number, minute: number) => { const d = new Date(day); d.setDate(d.getDate() - 7 * weeks); return d.getTime() + minute * 60_000; };
  const pastFridays = [1, 2, 3, 4].flatMap((w) => [paid(100 + w, at(w, 12 * 60), 1000000)]);
  const up = rulesSuggestions.insights({ events: [...pastFridays, paid(1, at(0, 12 * 60), 1500000)], now: friday });
  assert.equal(up[0].tone, 'good');
  assert.equal(up[0].title, 'Sales 50% above a usual Friday');
  assert.deepEqual(ids({ events: [...pastFridays, paid(1, at(0, 12 * 60), 1100000)], now: friday }), []);
});
