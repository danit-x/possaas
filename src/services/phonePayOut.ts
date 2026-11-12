import { useSyncExternalStore } from 'react';
import { newLineId } from '../domain/order.ts';
import type { PaidFrom } from '../domain/supplies.ts';
import type { SyncEvent } from '../domain/sync.ts';
import { isDemo, storageKey } from '../ui/storage.ts';
import { ownerToken } from './pairing.ts';

/**
 * Pay out from the owner's phone. The phone cannot reach the shop PC, so it leaves each bill or
 * payment with the cloud (POST /api/v1/inbox), which the shop server takes within seconds while
 * it is online (server/inbox.ts). Until the shop's own copy of the event comes back in the Owner
 * view, the phone keeps it here and counts it already (optimistic), saying it is still on its way.
 * Offline, it waits here and goes on the next try. The demo keeps it on the phone only.
 */
export type PhoneEntry =
  | { type: 'supply.billed'; supplierId: string; amount: number }
  | { type: 'supply.paid'; supplierId: string; amount: number; from: PaidFrom; spot: number }
  | { type: 'supply.undone'; undoneEventId: string };

interface Waiting { event: SyncEvent; sent: boolean }

const KEY = () => storageKey('phonePayOut.v1');
const ME = { id: 'phone', name: 'Owner (phone)', role: 'owner' as const };

const read = (): Waiting[] => {
  try {
    const raw = localStorage.getItem(KEY());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as Waiting[]) : [];
  } catch {
    return [];
  }
};
let cache: Waiting[] | null = null;
const listeners = new Set<() => void>();
const all = (): Waiting[] => (cache ??= read());
const write = (list: Waiting[]) => {
  cache = list;
  try { localStorage.setItem(KEY(), JSON.stringify(list)); } catch { /* full or blocked: it still counts on screen until the page closes */ }
  listeners.forEach((l) => l());
};

/** Bills and payments made on this phone that the shop has not sent back yet. */
export const usePhoneWaiting = (): Waiting[] =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, all);

/** The shop has these now: they stop waiting here. */
export const settle = (known: ReadonlySet<string>): void => {
  const list = all();
  if (list.some((w) => known.has(w.event.id))) write(list.filter((w) => !known.has(w.event.id)));
};

let sending: Promise<void> | null = null;
/** Something new came while a send was under way: go round once more. */
let again = false;
/** Sends what has not gone yet. Network trouble: tried again later. Refused: dropped (it would never count). */
export const sendWaiting = (): Promise<void> => {
  if (sending) { again = true; return sending; }
  sending = (async () => {
    do { again = false; await sendOnce(); } while (again);
  })().finally(() => { sending = null; });
  return sending;
};

const sendOnce = async (): Promise<void> => {
  const token = ownerToken();
  if (!token) return; // the demo, or a phone that was never paired
  for (const w of all().filter((x) => !x.sent)) {
    const { id, type, ...rest } = w.event as SyncEvent & Record<string, unknown>;
    const { shopId: _s, at: _a, actor: _p, orderNumber: _o, ...fields } = rest;
    let r: Response;
    try {
      r = await fetch('/api/v1/inbox', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ event: { id, type, ...fields } }), signal: AbortSignal.timeout(15_000),
      });
    } catch { return; }
    if (r.status >= 500) return;
    write(r.ok ? all().map((x) => (x.event.id === id ? { ...x, sent: true } : x)) : all().filter((x) => x.event.id !== id));
  }
};

/** Records it on this phone at once and sends it to the shop. Returns the event's id (for Undo). */
export function recordFromPhone(entry: PhoneEntry): string {
  const event = { ...entry, id: newLineId(), shopId: '', at: Date.now(), actor: ME, orderNumber: 0 } as SyncEvent;
  write([...all(), { event, sent: isDemo() }]);
  void sendWaiting();
  return event.id;
}

/** Tests: start from nothing. */
export const resetPhoneWaiting = (): void => { cache = null; };
