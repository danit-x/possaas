import type { Actor } from '../domain/auth.ts';
import type { SyncEvent } from '../domain/sync.ts';
import { percentOf } from '../domain/totals.ts';
import type { OrderLine, SizeId } from '../domain/types.ts';
import { BATA_KADE_ITEMS, bataKadeMenuEvents } from '../shop/bataKade.ts';
import { FAKE_SHOP_ID, FAKE_STAFF } from './data.ts';

/**
 * FAKE: five weeks of believable Bata Kade trading (rice & curry, kottu and fried rice at
 * Hapugala), for the Owner view in /?demo and for tests. Bata Kade's own menu, as the menu
 * events the shop server stores, then its sales: breakfast rice & curry from 7 to 10, lunch,
 * and a long dinner of kottu and fried rice. Deterministic (seeded), so a demo looks the same
 * every time. TODAY is deliberately a bad day, so the cards have something to show: fewer sales
 * than a usual same weekday, a burst of voids by one manager, a slow kitchen in the last two
 * hours, and Watalappan nobody has ordered for three weeks. The owner's Cash out lines (fish,
 * vegetables, gas, the bank) are on the paper list most days.
 * Nothing here is real, and none of it is ever synced.
 */

const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const nimal: Actor = FAKE_STAFF.find((s) => s.actor.role === 'cashier')!.actor;
const ravi: Actor = FAKE_STAFF.find((s) => s.actor.role === 'manager')!.actor;
const owner: Actor = FAKE_STAFF.find((s) => s.actor.role === 'owner')!.actor;

/** mulberry32: a small seeded random generator, so the demo is the same every time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** How often each item is ordered (kottu, fried rice and rice lead); anything not named: 1. */
const POPULAR: Record<string, number> = {
  'new-kt-chicken': 12, 'new-kt-egg': 9, 'new-fr-chicken': 10, 'new-fr-egg': 7, 'new-fr-mixed': 5,
  'new-rc-d-chicken': 10, 'new-rc-d-fish': 8, 'new-rc-d-egg': 7, 'new-rc-d-vege': 5, 'new-rc-d-special': 4,
  'new-rc-m-chicken': 6, 'new-rc-m-fish': 6, 'new-rc-m-egg': 6, 'new-rc-m-vege': 5, 'new-rc-m-special': 3,
  'new-ml-biriyani': 6, 'new-ot-milk-tea': 8, 'new-ot-plain-tea': 6, 'new-dr-coke-400ml': 4, 'new-dr-water-500ml': 4,
  'new-sh-string-hoppers-10': 3, 'new-rt-wade': 3, 'new-rt-egg-roti-plain': 3, 'new-ml-milk-rice': 3,
};
/** Nobody has ordered it for three weeks: the "not selling" card. */
const FORGOTTEN = 'new-ot-watalappan';
const MORNING = 'sec-rice-morning';
const DAYTIME = 'sec-rice';

/** The owner's paper list: who was paid from the drawer, and about how much (rupees). */
const CASH_OUTS: [string, number][] = [['Fish', 4500], ['Vegetables', 2300], ['Chicken', 6800], ['Gas', 4200], ['Bank', 20000]];

type Item = (typeof BATA_KADE_ITEMS)[number];
const priceOf = (item: Item, size?: SizeId) => item.item.prices[size ?? 'one'] ?? 0;

export function demoHistory(now: number, shopId = FAKE_SHOP_ID): SyncEvent[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  // The menu first, as the shop server stores it: Bata Kade's sections and items, the printed sample's hidden.
  const events: SyncEvent[] = [...bataKadeMenuEvents(shopId, today.getTime() - 40 * DAY, owner)];
  let orderNumber = 1001;
  let n = 0;
  const id = (p: string) => `demo-${p}-${++n}`;

  for (let back = 35; back >= 0; back--) {
    const day = new Date(today); day.setDate(day.getDate() - back);
    const dayStart = day.getTime();
    const isToday = back === 0;
    const rand = seeded(dayStart / DAY);
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const weekend = day.getDay() === 5 || day.getDay() === 6;
    let orders = Math.round((weekend ? 48 : 34) * (0.9 + rand() * 0.2));
    if (isToday) orders = Math.round(orders * 0.7); // a slow day

    const offered = BATA_KADE_ITEMS.filter((m) => !(m.id === FORGOTTEN && back <= 21));
    /** Breakfast sells the morning rice & curry; later, the lunch & dinner one. Everything else all day. */
    const chooser = (breakfast: boolean) => {
      const menu = offered.filter((m) => m.item.category !== (breakfast ? DAYTIME : MORNING));
      const weights = menu.map((m) => POPULAR[m.id] ?? 1);
      const total = weights.reduce((a, b) => a + b, 0);
      return () => {
        let r = rand() * total;
        for (let i = 0; i < menu.length; i++) { r -= weights[i]; if (r <= 0) return menu[i]; }
        return menu[menu.length - 1];
      };
    };
    const atBreakfast = chooser(true);
    const later = chooser(false);

    for (let o = 0; o < orders; o++) {
      // Breakfast 7-10 am for a fifth, lunch 12-2 pm for a third, dinner 6-10 pm for the rest.
      const r = rand();
      const breakfast = r < 0.2;
      const minute = breakfast ? 7 * 60 + rand() * 180 : r < 0.5 ? 12 * 60 + rand() * 120 : 18 * 60 + rand() * 240;
      const sentAt = dayStart + Math.floor(minute) * MIN + Math.floor(rand() * 60_000);
      if (sentAt > now) continue;
      const number = orderNumber++;
      const lines: OrderLine[] = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
        const item = (breakfast ? atBreakfast : later)();
        const sizes = (['x1', 'x2'] as SizeId[]).filter((s) => item.item.prices[s] !== undefined);
        const size = sizes.length ? pick(sizes) : undefined;
        return {
          id: id('line'), itemId: item.id, qty: rand() < 0.8 ? 1 : 2, ...(size ? { size } : {}),
          adds: [], outs: [], sent: true, unit: priceOf(item, size),
        };
      });
      const ticketId = id('ticket');
      events.push({ type: 'order.sent', id: id('sent'), shopId, at: sentAt, actor: nimal, orderNumber: number, ticketId, lines, addOn: false });

      // The kitchen: 5-10 minutes normally; 18-26 in tonight's last two hours.
      const slow = isToday && sentAt >= now - 2 * 60 * MIN;
      const cook = (slow ? 18 + rand() * 8 : 5 + rand() * 5) * MIN;
      const startAt = sentAt + Math.min(cook / 3, 3 * MIN);
      if (startAt <= now) events.push({ type: 'kitchen.started', id: id('start'), shopId, at: startAt, orderNumber: number, ticketId });
      if (sentAt + cook <= now) events.push({ type: 'kitchen.bumped', id: id('bump'), shopId, at: sentAt + cook, orderNumber: number, ticketId });

      const gross = (l: OrderLine) => (l.unit ?? 0) * l.qty;
      let total = lines.reduce((s, l) => s + gross(l), 0);
      // A void now and then; today, a burst of them, all by the same manager.
      const voidChance = isToday ? 0.45 : 0.015;
      if (lines.length > 1 && rand() < voidChance && sentAt + 3 * MIN <= now) {
        const gone = lines[lines.length - 1];
        const after = total - gross(gone);
        events.push({
          type: 'order.item_cancelled', id: id('void'), shopId, at: sentAt + 3 * MIN, actor: ravi, orderNumber: number,
          lineId: gone.id, index: lines.length - 1, before: gone, reason: pick(['Customer changed mind', 'Wrong item', 'Too long a wait']),
          totalBefore: total, totalAfter: after,
        });
        total = after;
      }
      // About one 10% discount a day.
      if (rand() < 0.03 && sentAt + 20 * MIN <= now) {
        const after = total - percentOf(total, 10);
        events.push({
          type: 'order.discount_set', id: id('disc'), shopId, at: sentAt + 20 * MIN, actor: ravi, orderNumber: number,
          before: null, after: { kind: 'percent', pct: 10 }, totalBefore: total, totalAfter: after,
        });
        total = after;
      }
      const paidAt = sentAt + (15 + rand() * 20) * MIN;
      if (paidAt <= now) {
        const cash = rand() < 0.8;
        const tendered = cash ? Math.ceil(total / 100000) * 100000 : total;
        events.push({
          type: 'order.paid', id: id('paid'), shopId, at: paidAt, actor: nimal, orderNumber: number,
          total, tender: cash ? 'cash' : 'transfer', tendered,
        });
      }
    }

    // The owner's Cash out, mid-morning: fish and vegetables most days, the rest now and then.
    for (const [name, rupees] of CASH_OUTS) {
      const often = name === 'Fish' || name === 'Vegetables' ? 0.85 : name === 'Bank' ? 0.15 : 0.35;
      if (rand() >= often) continue;
      const at = dayStart + Math.floor((9 * 60 + rand() * 120) * MIN);
      const amount = Math.round((rupees * (0.85 + rand() * 0.3)) / 50) * 50 * 100;
      events.push({ type: 'cash.out', id: id('cash'), shopId, at, actor: owner, orderNumber: 0, name, amount });
    }
  }

  return events.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
}
