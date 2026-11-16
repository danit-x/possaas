import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billBody, escpos, rasterBytes, receipt, receiptText, toDots } from './receipt.ts';
import { madeInMinutes } from './madeIn.ts';
import type { SyncEvent } from './sync.ts';
import type { PaidOrder } from './types.ts';

// The bill engine: the shop's logo as dots, the black band, "made in N min", the shared bill body.

const SHOP = { name: 'Sample Pizza', lines: ['Galle'], footer: 'Thank you!' };
const paid = {
  number: 1001, lines: [{ id: 'a', itemId: 'margherita', qty: 1, size: 'M', adds: [], outs: [] }],
  total: 145000, tender: 'cash', tendered: 145000, change: 0, paidAt: 0,
} as PaidOrder;

/** A 16 x 4 picture: a black bar on rows 1-2, white elsewhere, one transparent pixel. */
const picture = () => {
  const px = new Uint8ClampedArray(16 * 4 * 4).fill(255);
  for (let y = 1; y <= 2; y++) for (let x = 0; x < 16; x++) { const p = (y * 16 + x) * 4; px[p] = px[p + 1] = px[p + 2] = 0; }
  px[3] = 0; // transparent: paper
  return px;
};

test('a picture as dots: ink where dark, blank rows cut, transparent is paper', () => {
  const dots = toDots(picture(), 16, 4)!;
  assert.deepEqual([dots.width, dots.height], [16, 2]);
  assert.deepEqual([...atob(dots.bits)].map((c) => c.charCodeAt(0)), [0xff, 0xff, 0xff, 0xff]);
  assert.equal(toDots(new Uint8ClampedArray(16 * 4 * 4).fill(255), 16, 4), null, 'a blank picture: nothing to print');
});

test('raster bytes: GS v 0 with the row width and height, in bands of 64 rows', () => {
  const tall = { width: 8, height: 70, bits: btoa('\xff'.repeat(70)) };
  const b = rasterBytes(tall);
  assert.deepEqual(b.slice(0, 8), [0x1d, 0x76, 0x30, 0x00, 1, 0, 64, 0]);
  assert.deepEqual(b.slice(8 + 64, 8 + 64 + 8), [0x1d, 0x76, 0x30, 0x00, 1, 0, 6, 0]);
  assert.equal(b.length, 8 + 64 + 8 + 6);
});

test('the receipt with a logo: the picture first, then the name; the bytes carry it', () => {
  const logo = toDots(picture(), 16, 4)!;
  const lines = receipt(paid, { shop: { ...SHOP, logo }, cashier: 'Kasun' });
  assert.deepEqual(lines[0], { text: 'Sample Pizza', center: true, image: logo });
  assert.match(lines[1].text, /Sample Pizza/);
  assert.ok(Buffer.from(escpos(lines)).includes(Buffer.from([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0])));
  assert.equal(receipt(paid, { shop: SHOP, cashier: 'Kasun' }).some((l) => l.image), false, 'no logo: the name alone, as before');
});

test('MADE FRESH IN N MIN: a black band when the kitchen made it; none when not', () => {
  const lines = receipt(paid, { shop: SHOP, cashier: 'Kasun', madeIn: 9 });
  assert.deepEqual(lines.find((l) => l.invert), { text: 'MADE FRESH IN 9 MIN', center: true, bold: true, invert: true });
  assert.ok(Buffer.from(escpos(lines)).includes(Buffer.from([0x1d, 0x42, 0x01])));
  assert.doesNotMatch(receiptText(receipt(paid, { shop: SHOP, cashier: 'Kasun' })), /MADE FRESH/);
});

test('made in: Send to Done, the slowest ticket, rounded up; none when not made yet or another day', () => {
  const MIN = 60_000;
  const at = 100 * MIN;
  const ev = (e: object) => ({ shopId: 's', actor: { id: 'u', name: 'K', role: 'cashier' }, orderNumber: 1001, ...e }) as unknown as SyncEvent;
  const sent = (id: string, t: number) => ev({ id, at: t, type: 'order.sent', ticketId: id, lines: [], addOn: false });
  const done = (id: string, t: number) => ev({ id: `${id}d`, at: t, type: 'kitchen.bumped', ticketId: id });
  assert.equal(madeInMinutes([sent('t1', 80 * MIN)], 1001, at), null);
  assert.equal(madeInMinutes([sent('t1', 80 * MIN), done('t1', 88.2 * MIN)], 1001, at), 9);
  assert.equal(madeInMinutes([sent('t1', 80 * MIN), done('t1', 88 * MIN), sent('t2', 85 * MIN), done('t2', 97 * MIN)], 1001, at), 12);
  assert.equal(madeInMinutes([sent('t1', at - 7 * 60 * MIN), done('t1', at - 7 * 60 * MIN + 5 * MIN)], 1001, at), null);
});

test('the bill body is the receipt\'s middle: items, extras, then the rule', () => {
  const body = billBody(paid);
  assert.match(body[0].text, /^1 x Margherita/);
  assert.equal(body.at(-1)!.text, '-'.repeat(48));
});
