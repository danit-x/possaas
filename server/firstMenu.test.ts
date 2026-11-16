import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuStateFromEvents, effectiveMenu } from '../src/domain/menuEdits.ts';
import { MENU } from '../src/domain/menu.ts';
import { openAt, sectionsOf } from '../src/domain/sections.ts';
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
  assert.deepEqual(sectionsOf(state).slice(0, 4).map((s) => s.label), ['Rice & Curry', 'Rice & Curry', 'Fried Rice', 'Kottu']);
  // One Rice & Curry at a time: morning prices before 11, lunch & dinner prices after; fried rice at night only.
  const sold = (h: number) => {
    const t = new Date(2026, 10, 16, h).getTime();
    const open = new Set(sectionsOf(state).filter((s) => openAt(s.hours, t)).map((s) => s.id));
    return offered.filter((m) => open.has(m.category));
  };
  const veg = (h: number) => sold(h).filter((m) => m.name.en === 'Vegetable Rice & Curry').map((m) => m.price);
  assert.deepEqual(veg(7), [20000]);
  assert.deepEqual(veg(13), [22000]);
  assert.ok(sold(13).some((m) => m.name.en === 'Chicken Fried Rice') && sold(7).some((m) => m.name.en === 'Chicken Fried Rice'), 'fried rice all day');
  const egg = (h: number) => sold(h).filter((m) => m.name.en === 'Egg Rice & Curry').map((m) => m.price);
  assert.deepEqual([egg(7), egg(13)], [[23000], [28000]]);
  assert.ok(offered.some((m) => m.name.en === 'Water (1.5 L)' && m.price === 15000));
  assert.ok(offered.some((m) => m.name.en === 'Biriyani' && m.price === 33000));
});
