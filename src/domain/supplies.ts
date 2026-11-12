import type { Actor } from './auth.ts';
import type { Cents } from './types.ts';

/**
 * Pay out: the shop's suppliers, what it owes them and what it paid. Serves the manager at the
 * counter when goods come in or a supplier wants paying: they know who is at the door and the
 * bill in their hand; the single next thing is to note the bill, or pay. Suppliers deliver on
 * credit and are paid later ("when it is over"), so the shop owes = bills - payments.
 *
 * Everything is `supply.*` events (who, when, cents), never edited; an Undo is a new event.
 * A payment from the drawer leaves the cash, so Close the day expects that much less.
 */

/** Where the money came from: the cash drawer, or the shop's bank account. */
export type PaidFrom = 'drawer' | 'bank';

interface Base {
  id: string;
  shopId: string;
  at: number;
  actor: Actor;
  /** Not an order: 0, like menu changes and the day's close. */
  orderNumber: 0;
}

export type SupplyEvent =
  /** A supplier on the list, or its new name. "Other" payments (ice, a repair) are suppliers too. */
  | (Base & { type: 'supply.supplier_set'; supplierId: string; name: string })
  /** Goods came with a bill: the shop owes it. */
  | (Base & { type: 'supply.billed'; supplierId: string; amount: Cents })
  /**
   * Money paid. `spot`: the part of it that was not owed (bought and paid on the spot), so a
   * payment never leaves the shop owing less than nothing. Fixed when paid: an Undo of an
   * earlier bill does not turn it into a debt payment.
   */
  | (Base & { type: 'supply.paid'; supplierId: string; amount: Cents; from: PaidFrom; spot: Cents })
  | (Base & { type: 'supply.undone'; undoneEventId: string });

export const SUPPLY_EVENT_TYPES = ['supply.supplier_set', 'supply.billed', 'supply.paid', 'supply.undone'] as const satisfies readonly SupplyEvent['type'][];

export interface SupplyEntry { at: number; kind: 'bill' | 'paid'; amount: Cents; from?: PaidFrom }

export interface Supplier {
  id: string;
  name: string;
  owed: Cents;
  /** When the oldest bill not yet paid came (first in, first paid); null when nothing is owed. */
  owedSince: number | null;
  /** The last bill's amount: suppliers often bring the same again. */
  lastBill: Cents | null;
  /** Bills and payments, newest first. */
  history: SupplyEntry[];
  /** Latest bill or payment (or when added). */
  lastAt: number;
}

const undoneIds = (events: readonly { type: string }[]): Set<string> =>
  new Set(events.filter((e) => e.type === 'supply.undone').map((e) => (e as Extract<SupplyEvent, { type: 'supply.undone' }>).undoneEventId));

/** The supply events that stand (not undone), oldest first as given. */
const standing = (events: readonly { type: string }[]): Exclude<SupplyEvent, { type: 'supply.undone' }>[] => {
  const undone = undoneIds(events);
  return events.filter((e): e is Exclude<SupplyEvent, { type: 'supply.undone' }> =>
    e.type.startsWith('supply.') && e.type !== 'supply.undone' && !undone.has((e as SupplyEvent).id));
};

/**
 * Every supplier, the ones owed first (the oldest debt at the top), then the rest by
 * latest activity: who needs paying is always where the eye lands.
 */
export function suppliersFrom(events: readonly { type: string }[]): Supplier[] {
  const byId = new Map<string, { name: string | null; addedAt: number; bills: { at: number; left: Cents }[]; paid: Cents; history: SupplyEntry[]; lastBill: Cents | null; lastAt: number }>();
  const get = (id: string, at: number) => {
    let s = byId.get(id);
    if (!s) { s = { name: null, addedAt: at, bills: [], paid: 0, history: [], lastBill: null, lastAt: at }; byId.set(id, s); }
    return s;
  };
  for (const e of standing(events)) {
    const s = get(e.supplierId, e.at);
    if (e.type === 'supply.supplier_set') { s.name = e.name; continue; }
    s.lastAt = Math.max(s.lastAt, e.at);
    if (e.type === 'supply.billed') {
      s.bills.push({ at: e.at, left: e.amount });
      s.lastBill = e.amount;
      s.history.push({ at: e.at, kind: 'bill', amount: e.amount });
    } else {
      // The owed part pays the oldest bills first.
      let pay = e.amount - e.spot;
      for (const b of s.bills) {
        if (pay <= 0) break;
        const take = Math.min(b.left, pay);
        b.left -= take;
        pay -= take;
      }
      s.history.push({ at: e.at, kind: 'paid', amount: e.amount, from: e.from });
    }
  }
  const list: Supplier[] = [];
  for (const [id, s] of byId) {
    if (s.name === null) continue; // its adding was undone
    const open = s.bills.filter((b) => b.left > 0);
    list.push({
      id, name: s.name,
      owed: open.reduce((sum, b) => sum + b.left, 0),
      owedSince: open[0]?.at ?? null,
      lastBill: s.lastBill,
      history: [...s.history].sort((a, b) => b.at - a.at),
      lastAt: s.lastAt,
    });
  }
  return list.sort((a, b) =>
    (a.owedSince === null ? 1 : 0) - (b.owedSince === null ? 1 : 0) ||
    (a.owedSince !== null && b.owedSince !== null ? a.owedSince - b.owedSince : b.lastAt - a.lastAt));
}

/** The body of a payment of `amount` to a supplier who is owed `owed`: what was not owed was bought on the spot. */
export const payment = (owed: Cents, amount: Cents): { amount: Cents; spot: Cents } => ({ amount, spot: Math.max(0, amount - Math.max(0, owed)) });

export interface PaidOut {
  drawer: Cents;
  bank: Cents;
  /** Each payment, oldest first, for the day's report. */
  to: { name: string; amount: Cents; from: PaidFrom }[];
}

/** What was paid out between `from` and `to` (a business day), from the drawer and from the bank. */
export function paidOutBetween(events: readonly { type: string }[], from: number, to: number): PaidOut {
  const names = new Map<string, string>();
  const out: PaidOut = { drawer: 0, bank: 0, to: [] };
  for (const e of standing(events)) {
    if (e.type === 'supply.supplier_set') { names.set(e.supplierId, e.name); continue; }
    if (e.type !== 'supply.paid' || e.at < from || e.at >= to) continue;
    out[e.from] += e.amount;
    out.to.push({ name: e.supplierId, amount: e.amount, from: e.from });
  }
  // Named once every rename is read (a payment may come before the supplier's latest name).
  out.to = out.to.map((p) => ({ ...p, name: names.get(p.name) ?? 'Supplier' }));
  return out;
}

/** "today", "1 day", "9 days": how long a debt has waited, by calendar days. */
export function waited(since: number, now: number): string {
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(now) - day(since)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
}

/** A debt this old is shown in the warning colour. */
export const LONG_OWED_DAYS = 7;
export const owedLong = (since: number | null, now: number): boolean =>
  since !== null && now - since >= LONG_OWED_DAYS * 86_400_000;

/** The Owner view's Pay out box: today's pay-outs, what is still owed, and the debt that has waited longest. */
export interface PayOutSummary {
  today: PaidOut;
  owed: Cents;
  /** Owed suppliers, the longest waiting first. */
  owing: Supplier[];
  /** The longest-waiting debt, when it is old enough to say so. */
  overdue: Supplier | null;
}

/** Null when the shop has no suppliers yet: no box at all. `dayStart`: the business day's start (cashUp's businessDayStart). */
export function payOutSummary(events: readonly { type: string }[], dayStart: number, now: number): PayOutSummary | null {
  const suppliers = suppliersFrom(events);
  if (!suppliers.length) return null;
  const owing = suppliers.filter((s) => s.owed > 0);
  const oldest = owing[0] ?? null;
  return {
    today: paidOutBetween(events, dayStart, now + 1),
    owed: owing.reduce((sum, s) => sum + s.owed, 0),
    owing,
    overdue: oldest && owedLong(oldest.owedSince, now) ? oldest : null,
  };
}
