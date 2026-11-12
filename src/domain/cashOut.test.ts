import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cashOutsBetween, namesByUse, parseCashOut } from './cashOut.ts';

const at = (h: number, m = 0, day = 13) => new Date(2026, 10, day, h, m).getTime();
const actor = { id: 'o', name: 'Owner', role: 'owner' };
let n = 0;
const out = (name: string, amount: number, time: number) => ({ id: `c${++n}`, shopId: 's', type: 'cash.out', at: time, actor, orderNumber: 0, name, amount });
const undo = (target: { id: string }, time: number) => ({ id: `u${++n}`, shopId: 's', type: 'cash.out_undone', at: time, actor, orderNumber: 0, undoneEventId: target.id });

test('typed like the paper: a name and an amount, either way round', () => {
  assert.deepEqual(parseCashOut('fish 4500'), { name: 'Fish', amount: 450000 });
  assert.deepEqual(parseCashOut('4500 fish'), { name: 'Fish', amount: 450000 });
  assert.deepEqual(parseCashOut('  bank   20,000 '), { name: 'Bank', amount: 2000000 });
  assert.deepEqual(parseCashOut('ice rs 1,250.50'), { name: 'Ice', amount: 125050 });
  assert.deepEqual(parseCashOut('Gas cylinder 5500'), { name: 'Gas cylinder', amount: 550000 });
  assert.deepEqual(parseCashOut('මාළු 3500'), { name: 'මාළු', amount: 350000 }, 'Sinhala names as written');
  for (const bad of ['fish', '4500', 'fish 0', '', '12 34', 'fish 99999999']) assert.equal(parseCashOut(bad), null, bad);
});

test("the day's list: oldest first, its total, and only that business day", () => {
  const events = [out('Fish', 450000, at(7, 40)), out('Bank', 2000000, at(14, 30)), out('Gas', 550000, at(4, 50)), out('Veg', 230000, at(8, 15))];
  const day = cashOutsBetween(events, at(5), at(5, 0, 14));
  assert.deepEqual(day.lines.map((l) => l.name), ['Fish', 'Veg', 'Bank'], "4:50 am belongs to yesterday's day");
  assert.equal(day.total, 2680000);
  assert.equal(day.lines[0].by, 'Owner');
});

test('taking a line off, and putting it back with Undo', () => {
  const fish = out('Fish', 450000, at(9));
  const off = undo(fish, at(9, 5));
  assert.equal(cashOutsBetween([fish, off], at(5), at(23)).total, 0);
  assert.equal(cashOutsBetween([fish, off, undo(off, at(9, 6))], at(5), at(23)).total, 450000, 'Undo of the taking off puts it back');
});

test('the name buttons: most used first, one per name whatever the case', () => {
  const events = [out('Fish', 1, at(7)), out('fish', 1, at(8)), out('Bank', 1, at(9)), out('Gas', 1, at(10)), out('Bank', 1, at(11)), out('FISH', 1, at(12))];
  const gone = out('Ice', 1, at(13));
  assert.deepEqual(namesByUse([...events, gone, undo(gone, at(14))]), ['FISH', 'Bank', 'Gas'], 'taken-off lines do not count');
});
