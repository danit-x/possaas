import { lineItemName } from '../domain/halves.ts';
import type { NewTicket } from '../domain/kitchen.ts';
import type { Station } from '../domain/types.ts';
import { whap } from './sound.ts';

/**
 * A sent order (in a pay-first shop: a paid one) visibly flies off the Register towards the kitchen
 * that makes it (with a whap), so the cashier sees and hears where it went without reading.
 * One kitchen = the left one, like a ticket with no kitchen named.
 * The Register does not wait for it: the bill is already free for the next customer.
 */
export interface Flight {
  id: string;
  station: Station;
  number: number;
  items: string[];
}

type Listener = (flights: Flight[]) => void;
const listeners = new Set<Listener>();

export const onFlights = (l: Listener): (() => void) => { listeners.add(l); return () => listeners.delete(l); };

/** Shown on the flying card; the kitchen screen has the full detail. */
const MAX_ITEMS = 4;

export const flyToKitchens = (tickets: readonly NewTicket[]): void => {
  const flights = tickets.flatMap((t): Flight[] => {
    const items = t.lines.map((l) => `${l.qty} × ${lineItemName(l)}`);
    return [{
      id: t.id, station: t.station ?? 'left', number: t.number,
      items: items.length > MAX_ITEMS ? [...items.slice(0, MAX_ITEMS - 1), `+ ${items.length - MAX_ITEMS + 1} more`] : items,
    }];
  });
  if (!flights.length) return;
  for (const side of new Set(flights.map((f) => f.station))) whap(side);
  listeners.forEach((l) => l(flights));
};
