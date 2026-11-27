import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuStateFromEvents, effectiveMenu, type MenuEvent } from '../src/domain/menuEdits.ts';
import { MENU } from '../src/domain/menu.ts';
import { sectionsOf } from '../src/domain/sections.ts';
import { firstMenu } from './firstMenu.ts';
import { memoryStore } from './store.ts';

test("Bata Kade's menu is stored on the counter's first pull, once; CheesyBeez' printed items are hidden", async () => {
  const store = memoryStore();
  const { device: counter } = await store.addDevice('bata-kade-ab12', 'Bata Kade', 'counter');
  const { device: kitchen } = await store.addDevice('bata-kade-ab12', 'Bata Kade', 'kitchen');
  const seed = firstMenu({ store, shopId: () => 'bata-kade-ab12', now: () => 1_000 });

  assert.deepEqual(await seed(kitchen), [], 'only the counter brings it');
  const stored = await seed(counter);
  assert.ok(stored.length > 30);
  assert.deepEqual(await seed(counter), [], 'asked again: nothing more');
  // A restarted server sends the same events again: their ids are already stored, so nothing doubles.
  const again = await firstMenu({ store, shopId: () => 'bata-kade-ab12', now: () => 2_000 })(counter);
  assert.deepEqual(again, []);

  const events = (await store.pull('bata-kade-ab12', 0, 1000)).map((r) => r.event);
  const state = menuStateFromEvents(events);
  const offered = effectiveMenu(MENU, state, 3_000).filter((m) => !m.hidden);
  assert.ok(offered.some((m) => m.name.en === 'Chicken Kottu' && m.variants?.map((v) => `${v.label} ${v.price}`).join() === 'Half 50000,Full 75000'));
  assert.ok(offered.some((m) => m.name.en === 'Plain Tea' && m.price === 5000));
  assert.ok(!offered.some((m) => m.id === 'margherita'), 'no pizza');
  assert.deepEqual(sectionsOf(state).slice(0, 4).map((s) => s.label), ['Breakfast', 'Lunch', 'Fried Rice', 'Kottu']);
  // Rice & curry: two tabs, Breakfast and Lunch, each with its own prices, both all day (no clock).
  assert.ok(sectionsOf(state).every((s) => s.hours === null), 'every section all day');
  const price = (tab: string, name: string) => offered.filter((m) => m.category === tab && m.name.en === name).map((m) => m.price);
  assert.deepEqual(price('sec-rice-morning', 'Vegetable Rice & Curry'), [20000]);
  assert.deepEqual(price('sec-rice', 'Vegetable Rice & Curry'), [22000]);
  assert.deepEqual([price('sec-rice-morning', 'Egg Rice & Curry'), price('sec-rice', 'Egg Rice & Curry')], [[23000], [28000]]);
  assert.ok(offered.some((m) => m.name.en === 'Water (1.5 L)' && m.price === 15000));
  assert.ok(offered.some((m) => m.name.en === 'Biriyani' && m.price === 33000));
});

test('a shop that stored the timed "Rice & Curry" sections gets the Breakfast and Lunch tabs', async () => {
  const store = memoryStore();
  const { device: counter } = await store.addDevice('bata-kade-ab12', 'Bata Kade', 'counter');
  const actor = { id: 'lume-pos', name: 'Lume POS', role: 'owner' as const };
  const timed = (id: string, from: number, to: number): MenuEvent => ({
    id: `bk-menu-${id}`, shopId: 'bata-kade-ab12', at: 500, orderNumber: 0, actor, type: 'menu.section_set', itemId: id,
    before: null, after: { name: { en: 'Rice & Curry' }, cookMinutes: 3, hours: { from, to } },
  });
  await store.push(counter, [timed('sec-rice-morning', 300, 660), timed('sec-rice', 660, 300)], 500);
  await firstMenu({ store, shopId: () => 'bata-kade-ab12', now: () => 1_000 })(counter);
  const state = menuStateFromEvents((await store.pull('bata-kade-ab12', 0, 1000)).map((r) => r.event));
  const rice = sectionsOf(state).filter((s) => s.id === 'sec-rice-morning' || s.id === 'sec-rice');
  assert.deepEqual(rice.map((s) => [s.label, s.hours]), [['Breakfast', null], ['Lunch', null]]);
});
