import { test } from 'node:test';
import assert from 'node:assert/strict';
import { owedLong, paidOutBetween, payment, suppliersFrom, waited } from './supplies.ts';

const day = (d: number, h = 9) => new Date(2026, 10, d, h).getTime();
const actor = { id: 'm', name: 'Ravi', role: 'manager' };
let n = 0;
const ev = (type: string, at: number, body: object) => ({ id: `s${++n}`, shopId: 's', type, at, actor, orderNumber: 0, ...body });
const add = (supplierId: string, name: string, at = day(1, 6)) => ev('supply.supplier_set', at, { supplierId, name });
const bill = (supplierId: string, amount: number, at: number) => ev('supply.billed', at, { supplierId, amount });
const pay = (supplierId: string, amount: number, at: number, from = 'drawer', spot = 0) => ev('supply.paid', at, { supplierId, amount, from, spot });

test('what is owed: bills less payments, the oldest bill paid first', () => {
  const events = [
    add('nimal', 'Nimal · chicken'),
    bill('nimal', 1200000, day(3)),
    bill('nimal', 1250000, day(10)),
    pay('nimal', 1200000, day(10, 12)), // pays the 3rd's bill: the debt now dates from the 10th
  ];
  const [nimal] = suppliersFrom(events);
  assert.equal(nimal.owed, 1250000);
  assert.equal(nimal.owedSince, day(10));
  assert.equal(nimal.lastBill, 1250000);
  assert.deepEqual(nimal.history.map((h) => h.kind), ['paid', 'bill', 'bill'], 'newest first');
});

test('the list: owed first, the oldest debt on top; then the paid-up ones, latest first', () => {
  const events = [
    add('veg', 'Vegetables'), add('bread', 'Bread'), add('nimal', 'Nimal'), add('gas', 'Gas'),
    bill('veg', 500000, day(2)), pay('veg', 500000, day(2, 10)),
    bill('bread', 800000, day(9)),
    bill('nimal', 1200000, day(3)),
    bill('gas', 550000, day(11)), pay('gas', 550000, day(11, 10), 'bank'),
  ];
  assert.deepEqual(suppliersFrom(events).map((s) => s.name), ['Nimal', 'Bread', 'Gas', 'Vegetables']);
});

test('a part payment leaves the rest owed; an Undo takes a bill or a payment back', () => {
  const wrong = bill('nimal', 9999900, day(5));
  const part = pay('nimal', 400000, day(6));
  const events = [
    add('nimal', 'Nimal'), bill('nimal', 1000000, day(5)), wrong,
    ev('supply.undone', day(5, 10), { undoneEventId: wrong.id }), part,
  ];
  assert.equal(suppliersFrom(events)[0].owed, 600000);
  assert.equal(suppliersFrom([...events, ev('supply.undone', day(6, 10), { undoneEventId: part.id })])[0].owed, 1000000);
});

test('an undone supplier leaves the list; a new name replaces the old', () => {
  const added = add('ice', 'Ice');
  assert.deepEqual(suppliersFrom([added, ev('supply.undone', day(1, 7), { undoneEventId: added.id })]), []);
  assert.equal(suppliersFrom([add('n', 'Nimal'), add('n', 'Nimal · chicken', day(2))])[0].name, 'Nimal · chicken');
});

test('paying more than is owed: the rest was bought on the spot, never a debt below nothing', () => {
  assert.deepEqual(payment(250000, 300000), { amount: 300000, spot: 50000 });
  assert.deepEqual(payment(0, 150000), { amount: 150000, spot: 150000 });
  assert.deepEqual(payment(500000, 200000), { amount: 200000, spot: 0 });
  const events = [add('ice', 'Ice'), pay('ice', 150000, day(4), 'drawer', 150000), bill('ice', 100000, day(5))];
  assert.equal(suppliersFrom(events)[0].owed, 100000, 'a payment on the spot does not pay a later bill');
});

test("the day's pay-outs: from the drawer and from the bank, each named, undone ones left out", () => {
  const mistake = pay('gas', 550000, day(11, 11));
  const events = [
    add('nimal', 'Nimal'), add('gas', 'Gas'),
    pay('nimal', 2450000, day(11, 10)),
    mistake, ev('supply.undone', day(11, 12), { undoneEventId: mistake.id }),
    pay('gas', 550000, day(11, 13), 'bank'),
    pay('nimal', 100000, day(12, 10)), // the next day
  ];
  const out = paidOutBetween(events, day(11, 5), day(12, 5));
  assert.equal(out.drawer, 2450000);
  assert.equal(out.bank, 550000);
  assert.deepEqual(out.to, [{ name: 'Nimal', amount: 2450000, from: 'drawer' }, { name: 'Gas', amount: 550000, from: 'bank' }]);
});

test('how long a debt has waited, and when it is long', () => {
  assert.equal(waited(day(10, 8), day(10, 20)), 'today');
  assert.equal(waited(day(9, 23), day(10, 1)), '1 day');
  assert.equal(waited(day(1), day(10)), '9 days');
  assert.equal(owedLong(day(1), day(10)), true);
  assert.equal(owedLong(day(8), day(10)), false);
  assert.equal(owedLong(null, day(10)), false);
});
