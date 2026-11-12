import { retryDelayMs, type SyncEvent } from '../src/domain/sync.ts';
import { validatePush } from './validate.ts';

/**
 * Pay out from the owner's phone (cloud/src/inbox.ts). The phone cannot reach this PC, so it
 * leaves a supplier's bill or payment with the cloud; every few seconds while the internet is
 * up, this takes what is waiting, stores it as ordinary events (`take`: stored, streamed to the
 * counter, copied back to the cloud), then tells the cloud it has them. Stored first, confirmed
 * after: a lost answer only brings the same events again, and the store keeps one per id.
 * Anything this shop would not accept is dropped (and said so in the log), never retried forever.
 */
export interface InboxOptions {
  url: string;
  token: string;
  tenantId: string;
  /** Stores these events as this shop's own. */
  take(events: SyncEvent[]): Promise<void>;
  fetch?: typeof fetch;
  every?: number;
}

const MAX_BACKOFF_MS = 5 * 60_000;

/** Only Pay out, only from an owner, only for this shop: what the phone is allowed to record. */
export const fromPhone = (e: unknown, tenantId: string): e is SyncEvent => {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as Record<string, unknown>;
  if (typeof x.type !== 'string' || !x.type.startsWith('supply.')) return false;
  if (typeof x.actor !== 'object' || x.actor === null || (x.actor as Record<string, unknown>).role !== 'owner') return false;
  return !('reason' in validatePush({ events: [e] }, tenantId));
};

export function startInbox(o: InboxOptions) {
  const http = o.fetch ?? fetch;
  const every = o.every ?? 10_000;
  const headers = { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let failures = 0;
  let running: Promise<void> | null = null;

  const pass = async (): Promise<void> => {
    try {
      const r = await http(`${o.url}/api/v1/inbox`, { headers, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`cloud answered ${r.status}`);
      const { events } = (await r.json()) as { events: unknown[] };
      if (events.length) {
        const good = events.filter((e) => fromPhone(e, o.tenantId));
        if (good.length < events.length) console.warn(`Pay out from the phone: ${events.length - good.length} not accepted.`);
        if (good.length) await o.take(good);
        const ids = events.map((e) => (e as { id?: unknown }).id).filter((id): id is string => typeof id === 'string');
        const done = await http(`${o.url}/api/v1/inbox/taken`, { method: 'POST', headers, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(15_000) });
        if (!done.ok) throw new Error(`cloud answered ${done.status}`);
      }
      failures = 0;
      schedule(every);
    } catch (e) {
      if (failures === 0) console.warn(`Pay out from the phone paused (${e instanceof Error ? e.message : String(e)}); retrying quietly.`);
      schedule(Math.min(MAX_BACKOFF_MS, retryDelayMs(failures++)));
    }
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void run(), ms);
  };
  const run = (): Promise<void> => (running ??= pass().finally(() => { running = null; }));

  void run();
  return {
    /** One pass now (tests). */
    async takeNow() { while (running) await running; await run(); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
