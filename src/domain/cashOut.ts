import type { Actor } from './auth.ts';
import type { Cents } from './types.ts';

/**
 * Cash out: the owner's paper list, on the shop PC. Fish 4,500, Vegetables 2,300, Bank 20,000:
 * every line is cash that left the drawer, a name and an amount. Serves the owner or a manager
 * at the counter who has just paid someone from the drawer: they know who and how much; the
 * single next thing is to write it down, as fast as on paper ("fish 4500", Enter).
 *
 * Everything is `cash.*` events (who, when, cents), never edited. Taking a line off is a
 * `cash.out_undone`, and so is putting it back (an undone undo): the newest word wins.
 * Close the day expects that much less cash in the drawer.
 */

interface Base {
  id: string;
  shopId: string;
  at: number;
  actor: Actor;
  /** Not an order: 0, like menu changes and the day's close. */
  orderNumber: 0;
}

export type CashOutEvent =
  /** Cash taken from the drawer: to whom or for what (any words), and how much. */
  | (Base & { type: 'cash.out'; name: string; amount: Cents })
  /** A line taken off (or, pointing at an earlier undo, put back). */
  | (Base & { type: 'cash.out_undone'; undoneEventId: string });

export const CASH_EVENT_TYPES = ['cash.out', 'cash.out_undone'] as const satisfies readonly CashOutEvent['type'][];

export const MAX_NAME = 40;
/** Rs 10,000,000: anything bigger is a typing slip. */
export const MAX_CASH_OUT: Cents = 1_000_000_000;

/** Which events stand: an undo cancels its target, unless that undo is itself undone. */
const standingIds = (events: readonly { type: string }[]): ((id: string) => boolean) => {
  const undos = new Map<string, string[]>(); // target id -> the undo events pointing at it
  for (const e of events) {
    if (e.type !== 'cash.out_undone') continue;
    const u = e as Extract<CashOutEvent, { type: 'cash.out_undone' }>;
    undos.set(u.undoneEventId, [...(undos.get(u.undoneEventId) ?? []), u.id]);
  }
  const memo = new Map<string, boolean>();
  const stands = (id: string, depth = 0): boolean => {
    if (depth > 50) return true; // a loop cannot happen with fresh ids; never hang on bad data
    const known = memo.get(id);
    if (known !== undefined) return known;
    const result = !(undos.get(id) ?? []).some((u) => stands(u, depth + 1));
    memo.set(id, result);
    return result;
  };
  return (id) => stands(id);
};

export interface CashOutLine { id: string; name: string; amount: Cents; at: number; by: string }
export interface CashOutDay {
  total: Cents;
  /** Oldest first, like the paper. */
  lines: CashOutLine[];
}

/** The cash outs that stand between `from` and `to` (a business day). */
export function cashOutsBetween(events: readonly { type: string }[], from: number, to: number): CashOutDay {
  const stands = standingIds(events);
  const lines: CashOutLine[] = [];
  for (const raw of events) {
    if (raw.type !== 'cash.out') continue;
    const e = raw as Extract<CashOutEvent, { type: 'cash.out' }>;
    if (e.at < from || e.at >= to || !stands(e.id)) continue;
    lines.push({ id: e.id, name: e.name, amount: e.amount, at: e.at, by: e.actor.name });
  }
  lines.sort((a, b) => a.at - b.at);
  return { total: lines.reduce((sum, l) => sum + l.amount, 0), lines };
}

/** Names written before, the most used first (the buttons under the entry line). Same name, any case: one button. */
export function namesByUse(events: readonly { type: string }[], limit = 8): string[] {
  const stands = standingIds(events);
  const counts = new Map<string, { name: string; n: number; last: number }>();
  for (const raw of events) {
    if (raw.type !== 'cash.out') continue;
    const e = raw as Extract<CashOutEvent, { type: 'cash.out' }>;
    if (!stands(e.id)) continue;
    const key = e.name.toLocaleLowerCase();
    const was = counts.get(key);
    counts.set(key, { name: e.name, n: (was?.n ?? 0) + 1, last: Math.max(was?.last ?? 0, e.at) });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit).map((c) => c.name);
}

/**
 * One line as typed: "fish 4500", "4500 fish", "bank 20,000", "Rs 1,250.50 ice", "මාළු 3500".
 * The amount is whole rupees or rupees and cents; the rest is the name (first letter made capital).
 * Null when there is no name or no sensible amount.
 */
export function parseCashOut(text: string): { name: string; amount: Cents } | null {
  const t = text.trim().replace(/\s+/g, ' ');
  const money = String.raw`(?:rs\.?\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
  const end = new RegExp(String.raw`^(.+?)\s+${money}$`, 'i').exec(t);
  const start = end ? null : new RegExp(String.raw`^${money}\s+(.+)$`, 'i').exec(t);
  const m = end ?? start;
  if (!m) return null;
  const [rupees, cents, rawName] = end ? [m[2], m[3], m[1]] : [m[1], m[2], m[3]];
  const amount = Number(rupees.replace(/,/g, '')) * 100 + Number((cents ?? '').padEnd(2, '0'));
  const name = rawName.trim().slice(0, MAX_NAME);
  if (!name || /^[\d.,\s]+$/.test(name) || !Number.isSafeInteger(amount) || amount <= 0 || amount >= MAX_CASH_OUT) return null;
  return { name: name.charAt(0).toLocaleUpperCase() + name.slice(1), amount };
}
