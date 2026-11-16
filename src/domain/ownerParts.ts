import { businessDayStart, cashOutsBetween } from './cashOut.ts';
import { rulesSuggestions } from './insights.ts';
import { MENU } from './menu.ts';
import { effectiveMenu, menuStateFromEvents } from './menuEdits.ts';
import { fmt } from './money.ts';
import type { SyncEvent } from './sync.ts';

/**
 * The owner's sidebar (SCRUM-131): the work (Sell, Today, Cash out), then the menu and customers,
 * then Settings. One line per part saying what is going on there, and a badge only when something
 * there needs a decision. Pure, like insights.ts: events in, lines out. Nothing is a count for its
 * own sake ("Egg Kottu sold out", not "60 items").
 */
export type PartId = 'sell' | 'owner' | 'cashout' | 'menu' | 'customers' | 'setup';

export interface PartLine {
  preview: string;
  /** Decisions waiting there; 0 = all quiet. */
  badge: number;
}

const DAY_MS = 24 * 60 * 60_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Egg Kottu", "Egg Kottu and 1 more": one line in a narrow sidebar, so one name at most. */
const names = (list: readonly string[]) => (list.length === 1 ? list[0] : `${list[0]} and ${list.length - 1} more`);

export const ownerParts = (events: readonly SyncEvent[], now: number): Record<PartId, PartLine> => {
  const shop = { events, now };
  const summary = rulesSuggestions.summary(shop);
  const insights = rulesSuggestions.insights(shop);
  const menu = effectiveMenu(MENU, menuStateFromEvents(events), now).filter((m) => !m.removed && !m.hidden);
  const soldOut = menu.filter((m) => m.soldOut);
  const day = businessDayStart(now);
  const cash = cashOutsBetween(events, day, day + DAY_MS);

  return {
    sell: { preview: 'The register', badge: 0 },
    owner: {
      preview: summary.orders ? `Rs ${fmt(summary.salesCents)} · ${plural(summary.orders, 'order')}` : 'No sales yet today',
      badge: insights.filter((i) => i.tone === 'attention').length,
    },
    cashout: { preview: cash.lines.length ? `Rs ${fmt(cash.total)} out today` : 'Nothing out today', badge: 0 },
    menu: { preview: soldOut.length ? `${names(soldOut.map((m) => m.name.en))} sold out today` : 'Prices, names, sold out', badge: 0 },
    // Customers (CRM): shown only while the developers have it on (modules.ts); the list itself is on the shop PC.
    customers: { preview: 'Who buys, and the list', badge: 0 },
    setup: { preview: 'Shop, staff, printer', badge: 0 },
  };
};
