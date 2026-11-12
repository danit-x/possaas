import { SUPPLY_EVENT_TYPES } from '../../src/domain/supplies.ts';
import type { SyncEvent } from '../../src/domain/sync.ts';
import { validatePush } from '../../server/validate.ts';
import type { CloudDevice, D1Like, Kind } from './cloud.ts';
import { HttpError, json } from './http.ts';

/**
 * The owner's phone records Pay out from afar (a supplier paid by bank, a bill that came in).
 * The shop PC is the truth and the phone cannot reach it, so the cloud keeps what the phone
 * sends here; the shop server takes it (server/inbox.ts) and stores it as an ordinary event,
 * which then copies back up like any other and reaches the phone's Owner view.
 *
 * - POST /api/v1/inbox            the phone: { event } (a supply.* event without who or when)
 * - GET  /api/v1/inbox            the shop server: what is waiting, oldest first
 * - POST /api/v1/inbox/taken      the shop server: { ids } it has stored
 *
 * The cloud fills in who (the owner, on this phone), when (its own clock) and which shop: the
 * phone says only what happened. Sending the same id twice is harmless.
 */
export interface InboxContext {
  db: D1Like;
  now: () => number;
  authenticate: (req: Request, allowed: Kind[]) => Promise<CloudDevice>;
}

const TYPES = new Set<string>(SUPPLY_EVENT_TYPES);
const FIELDS = ['supplierId', 'name', 'amount', 'from', 'spot', 'undoneEventId'] as const;
const BATCH = 100;

/** Who the shop's audit shows for anything paid from the phone. */
export const phoneActor = (deviceId: string) => ({ id: `phone-${deviceId}`, name: 'Owner (phone)', role: 'owner' as const });

const body = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const b = await req.json();
    if (typeof b === 'object' && b !== null && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch { /* answered below */ }
  throw new HttpError(400, 'invalid_event', 'body is not a JSON object');
};

export async function inboxRoutes(req: Request, url: URL, c: InboxContext): Promise<Response | null> {
  const { db, now } = c;
  if (url.pathname === '/api/v1/inbox' && req.method === 'POST') {
    const device = await c.authenticate(req, ['owner']);
    const sent = (await body(req)).event;
    if (typeof sent !== 'object' || sent === null) throw new HttpError(400, 'invalid_event', 'body must be { event }');
    const s = sent as Record<string, unknown>;
    if (typeof s.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(s.id)) throw new HttpError(400, 'invalid_event', 'the event needs an id');
    if (typeof s.type !== 'string' || !TYPES.has(s.type)) throw new HttpError(400, 'invalid_event', 'the phone records Pay out only');
    const event = {
      id: s.id, type: s.type, shopId: device.tenantId, at: now(), actor: phoneActor(device.id), orderNumber: 0,
      ...Object.fromEntries(FIELDS.filter((f) => s[f] !== undefined).map((f) => [f, s[f]])),
    };
    // The same checks the shop server will run: the cloud never keeps what the shop would refuse.
    const checked = validatePush({ events: [event] }, device.tenantId);
    if ('reason' in checked) throw new HttpError(400, 'invalid_event', checked.reason);
    await db.prepare('INSERT OR IGNORE INTO inbox (tenant_id, id, device_id, body, received_at) VALUES (?, ?, ?, ?, ?)')
      .bind(device.tenantId, event.id, device.id, JSON.stringify(event), event.at).run();
    return json(200, { id: event.id });
  }
  if (url.pathname === '/api/v1/inbox' && req.method === 'GET') {
    const device = await c.authenticate(req, ['shop_server']);
    const { results } = await db.prepare(
      'SELECT body FROM inbox WHERE tenant_id = ? AND taken_at IS NULL ORDER BY seq LIMIT ?')
      .bind(device.tenantId, BATCH).all<{ body: string }>();
    return json(200, { events: results.map((r) => JSON.parse(r.body) as SyncEvent) });
  }
  if (url.pathname === '/api/v1/inbox/taken' && req.method === 'POST') {
    const device = await c.authenticate(req, ['shop_server']);
    const ids = (await body(req)).ids;
    if (!Array.isArray(ids) || ids.length > BATCH || !ids.every((id) => typeof id === 'string')) {
      throw new HttpError(400, 'invalid_event', `body must be { ids: [] }, at most ${BATCH}`);
    }
    const t = now();
    const done = ids.length
      ? await db.batch(ids.map((id) => db.prepare('UPDATE inbox SET taken_at = ? WHERE tenant_id = ? AND id = ? AND taken_at IS NULL').bind(t, device.tenantId, id)))
      : [];
    return json(200, { taken: done.reduce((n, r) => n + r.meta.changes, 0) });
  }
  return null;
}
