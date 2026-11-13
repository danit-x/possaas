import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { EMPTY_MENU_STATE, EMPTY_START, effectiveMenu, menuStateFromEvents } from '../src/domain/menuEdits.ts';
import { loadMenu, menuFile, menuLoadEvents, type MenuLoad } from '../src/domain/menuFile.ts';
import type { PullResponse, SyncEvent } from '../src/domain/sync.ts';
import { BATA_KADE_MENU, BATA_KADE_UPDATES } from '../src/shop/bataKade.ts';
import { createApp } from './app.ts';
import { MENU_INSTALLER, firstMenu } from './firstMenu.ts';
import { memoryStore, type EventStore } from './store.ts';
import { validatePush } from './validate.ts';

const SHOP = 'shop-bata';

/** The cloud takes copied events in batches of 100 (server/replicator.ts) and checks each one. */
const cloudTakes = (events: SyncEvent[]) => {
  for (let i = 0; i < events.length; i += 100) {
    const r = validatePush({ events: events.slice(i, i + 100) }, SHOP);
    assert.ok(!('reason' in r), 'reason' in r ? r.reason : '');
  }
};

/** A shop server with the first-menu step, and its counter's pull. */
async function shop(store: EventStore, counterToken?: string) {
  const counter = counterToken ? { token: counterToken } : await store.addDevice(SHOP, 'Bata Kade', 'counter');
  const server = createApp({ store, now: () => 5000, firstMenu: firstMenu({ store, menu: BATA_KADE_MENU, updates: BATA_KADE_UPDATES, shopId: () => SHOP, now: () => 5000 }) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const pull = async (token = counter.token) =>
    (await (await fetch(`${base}/api/v1/events?after=0`, { headers: { authorization: `Bearer ${token}` } })).json()) as PullResponse;
  const stop = () => new Promise<void>((r) => server.close(() => r()));
  return { pull, stop, token: counter.token };
}

test("a shop with no menu gets Bata Kade's menu on its counter's first pull: every item, at its price, by Lume POS", async () => {
  const store = memoryStore();
  const s = await shop(store);
  const events = (await s.pull()).events.map((e) => e.event);
  const menu = effectiveMenu(EMPTY_START, menuStateFromEvents(events), 0);
  assert.equal(menu.length, BATA_KADE_MENU.items.length);
  assert.equal(menu.find((m) => m.name.en === 'Chicken Kottu')!.variants!.map((v) => v.price).join(), '50000,75000');
  assert.ok(events.every((e) => 'actor' in e && e.actor.name === 'Lume POS'));
  // The cloud checks every copied event the same way: the menu must pass.
  cloudTakes(events);
  await s.stop();
});

test('the menu is added once: a restarted server, or a second pull, adds nothing', async () => {
  const store = memoryStore();
  const first = await shop(store);
  const n = (await first.pull()).events.length;
  assert.equal((await first.pull()).events.length, n);
  await first.stop();
  const again = await shop(store, first.token);
  assert.equal((await again.pull()).events.length, n);
  await again.stop();
});

test("a shop that had other menu changes still gets the menu; the owner's own changes stay; a kitchen screen adds nothing", async () => {
  const store = memoryStore();
  const counter = await store.addDevice(SHOP, 'Bata Kade', 'counter');
  const owner = { id: 'o', name: 'Owner', role: 'owner' as const };
  const s = await shop(store, counter.token);
  await s.pull();
  // The owner takes Milo off and changes the Egg Kottu price; then the server restarts.
  const at = 6000;
  const own = [
    { id: 'o1', shopId: SHOP, at, orderNumber: 0, actor: owner, type: 'menu.item_added', itemId: 'new-ot-milo', item: null },
    { id: 'o2', shopId: SHOP, at, orderNumber: 0, actor: owner, type: 'menu.price_set', itemId: 'new-kt-egg', before: {}, after: { prices: { normal: 50000, full: 70000 } } },
  ] as SyncEvent[];
  await store.push({ id: counter.device.id, tenantId: SHOP, kind: 'counter' }, own, at);
  await s.stop();
  const again = await shop(store, counter.token);
  const menu = effectiveMenu(EMPTY_START, menuStateFromEvents((await again.pull()).events.map((e) => e.event)), 0).filter((m) => !m.hidden);
  assert.equal(menu.find((m) => m.name.en === 'Milo'), undefined);
  assert.equal(menu.find((m) => m.name.en === 'Egg Kottu')!.variants!.map((v) => v.price).join(), '50000,70000');
  assert.equal(menu.length, BATA_KADE_MENU.items.length - 1);
  await again.stop();

  const fresh = memoryStore();
  const kitchen = await fresh.addDevice(SHOP, 'Bata Kade', 'kitchen');
  const k = await shop(fresh, kitchen.token);
  assert.equal((await k.pull()).events.length, 0);
  await k.stop();
});

test("a shop with the old menu gets each menu update once: new prices, Half / Full, bread and string hoppers with extras, one biriyani; the owner's own changes stay", async () => {
  const store = memoryStore();
  const counter = await store.addDevice(SHOP, 'Bata Kade', 'counter');
  const owner = { id: 'o', name: 'Owner', role: 'owner' as const };
  // What a shop PC got from the menu before 2026-11-13 (same event ids), then the owner's own change.
  const load = loadMenu(menuFile(BATA_KADE_MENU, EMPTY_MENU_STATE), { sections: [], items: [] }) as MenuLoad;
  const old = menuLoadEvents(load, SHOP, MENU_INSTALLER, 1).map((e) => {
    if (e.type === 'menu.section_set' && e.sectionId === 'sec-fried-rice') {
      return { ...e, section: { ...e.section, hours: { from: 1080, to: 300 }, sizes: [{ id: 'normal', label: 'Normal' }, { id: 'full', label: 'Full' }] } };
    }
    if (e.type === 'menu.item_added' && e.itemId === 'new-rc-m-egg') return { ...e, item: { ...e.item, prices: { normal: 25000 } } };
    if (e.type === 'menu.item_added' && e.itemId === 'new-ot-yoghurt') return { ...e, item: { ...e.item, name: { en: 'Yoghurt' } } };
    return e;
  });
  // Items the menu had then and no longer has.
  const gone = (id: string, category: string, en: string, prices: Record<string, number>) => ({ id: `menu-load-new-${id}`, shopId: SHOP, at: 1,
    orderNumber: 0, actor: MENU_INSTALLER, type: 'menu.item_added', itemId: `new-${id}`, item: { category, name: { en }, description: '', prices } });
  const before = [
    gone('rt-biriyani', 'sec-roti', 'Biriyani', { one: 50000 }),
    gone('ml-bread-egg', 'sec-meals', 'Bread with Gravy & Egg', { one: 20000 }),
    gone('ml-string-hoppers', 'sec-meals', 'String Hoppers (10)', { one: 12000 }),
    gone('fr-biriyani-chicken', 'sec-fried-rice', 'Chicken Biriyani', { normal: 45000, full: 75000 }),
    gone('dr-beer', 'sec-drinks', 'Beer / Malt Drink', { one: 18000 }),
  ];
  const own = { id: 'o1', shopId: SHOP, at: 2, orderNumber: 0, actor: owner, type: 'menu.price_set', itemId: 'new-kt-egg', before: {}, after: { prices: { normal: 46000, full: 66000 } } };
  await store.push({ id: counter.device.id, tenantId: SHOP, kind: 'counter' }, [...old, ...before, own] as SyncEvent[], 2);

  const s = await shop(store, counter.token);
  const events = (await s.pull()).events.map((e) => e.event);
  // The cloud checks every copied event the same way (in batches of 100): the updates must pass.
  cloudTakes(events);
  const state = menuStateFromEvents(events);
  const menu = effectiveMenu(EMPTY_START, state, 0).filter((m) => !m.hidden && !m.removed);
  const item = (en: string, section = '') => menu.find((m) => m.name.en === en && m.category.includes(section))!;
  assert.equal(item('Egg Rice & Curry', 'morning').variants!.map((v) => v.price).join(), '23000');
  assert.equal(item('Egg Rice & Curry', 'day').variants!.map((v) => v.price).join(), '28000');
  assert.equal(item('Noodles').price, 16000);
  assert.equal(state.sections['sec-fried-rice'].hours, undefined);
  assert.equal(state.sections['sec-kottu'].sizes[0].label, 'Half');
  assert.equal(item('Chicken Kottu').variants!.map((v) => `${v.label} ${v.price}`).join(), 'Half 50000,Full 75000');
  // One biriyani; the old ones, the separate bread items and beer are gone.
  assert.equal(menu.filter((m) => /biriyani/i.test(m.name.en)).map((m) => `${m.category} ${m.price}`).join(), 'sec-meals 33000');
  for (const en of ['Bread with Gravy & Egg', 'Chicken Biriyani', 'Beer / Malt Drink']) assert.equal(menu.find((m) => m.name.en === en), undefined, en);
  // Bread and string hoppers in sections of their own, with their extras.
  assert.equal(item('Bread with Dhal').category, 'sec-bread');
  assert.equal(item('Bread with Dhal').adds.map((a) => `${a.label} ${a.price}`).join(), 'Egg 5000,Fish 10000,Chicken 12000');
  assert.equal(menu.filter((m) => m.name.en.startsWith('String Hoppers')).map((m) => `${m.category} ${m.price}`).join(),
    'sec-string-hoppers 12000,sec-string-hoppers 16000,sec-string-hoppers 20000');
  assert.equal(item('String Hoppers (10)').adds.map((a) => `${a.label} ${a.price}`).join(), '5 more 4000,10 more 8000');
  assert.equal(state.sections['sec-roti'].name, 'Roti & Rolls · රොටි / රෝල්ස්');
  assert.equal(item('Drink (Medium)').price, 18000);
  // Sinhala names, and the owner's own price stays.
  assert.equal(item('Yoghurt').name.si, 'යෝගට්');
  assert.equal(item('Egg Kottu').variants!.map((v) => v.price).join(), '46000,66000');
  await s.stop();

  // Sent once: a restart stores nothing more, and a later owner price stays.
  await store.push({ id: counter.device.id, tenantId: SHOP, kind: 'counter' },
    [{ id: 'o2', shopId: SHOP, at: 9000, orderNumber: 0, actor: owner, type: 'menu.price_set', itemId: 'new-ml-noodles', before: {}, after: { prices: { one: 17000 } } }] as SyncEvent[], 9000);
  const again = await shop(store, counter.token);
  const after = (await again.pull()).events;
  assert.equal(after.length, events.length + 1);
  assert.equal(effectiveMenu(EMPTY_START, menuStateFromEvents(after.map((e) => e.event)), 0).find((m) => m.name.en === 'Noodles')!.price, 17000);
  await again.stop();
});

test('a test PC that had its own menu sections gets the menu too', async () => {
  const store = memoryStore();
  const counter = await store.addDevice(SHOP, 'Bata Kade', 'counter');
  const old = { id: 'm1', shopId: SHOP, at: 1, orderNumber: 0, actor: { id: 'o', name: 'Owner', role: 'owner' },
    type: 'menu.section_set', sectionId: 'sec-tea', section: null } as SyncEvent;
  await store.push({ id: counter.device.id, tenantId: SHOP, kind: 'counter' }, [old], 1);
  const s = await shop(store, counter.token);
  const menu = effectiveMenu(EMPTY_START, menuStateFromEvents((await s.pull()).events.map((e) => e.event)), 0);
  assert.equal(menu.length, BATA_KADE_MENU.items.length);
  await s.stop();
});
