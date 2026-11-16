import { ticketTimes } from './insights.ts';
import type { SyncEvent } from './sync.ts';

/**
 * How many minutes the kitchen took for this order, Send to Done, for "MADE FRESH IN N MIN" on the
 * receipt: its slowest ticket sent in the 6 hours before `at` (numbers repeat across days), rounded up
 * to a whole minute. Null when the kitchen has not finished it yet (paid before it was made) or
 * nothing went to it.
 */
export const madeInMinutes = (events: readonly SyncEvent[], orderNumber: number, at: number): number | null => {
  const mine = ticketTimes(events).filter((t) => t.orderNumber === orderNumber && t.sentAt <= at && t.sentAt > at - 6 * 60 * 60_000);
  if (!mine.length) return null;
  return Math.max(1, Math.ceil(Math.max(...mine.map((t) => t.minutes))));
};
