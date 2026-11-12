import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloud, sha256Hex } from './cloud.ts';
import { fakeD1 } from './fakeD1.ts';

const SHOP = 'bata-kade-galle-ab12';

async function setup() {
  const { d1, db } = fakeD1();
  for (const [shop, server, phone] of [[SHOP, 'server-a', 'phone-a'], ['other-shop', 'server-b', 'phone-b']]) {
    db.prepare("INSERT INTO shops (id, name, created_at) VALUES (?, ?, 0)").run(shop, shop);
    db.prepare("INSERT INTO devices (id, tenant_id, kind, token_hash, created_at) VALUES (?, ?, 'shop_server', ?, 0)").run(`dev-${server}`, shop, await sha256Hex(server));
    db.prepare("INSERT INTO devices (id, tenant_id, kind, token_hash, created_at) VALUES (?, ?, 'owner', ?, 0)").run(`dev-${phone}`, shop, await sha256Hex(phone));
  }
  const clock = { t: 5_000_000 };
  const handle = createCloud(d1, { now: () => clock.t });
  const call = async (path: string, token: string, body?: unknown) => {
    const r = await handle(new Request(`https://cloud.test${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: r.status, body: await r.json() as Record<string, any> };
  };
  return { call, clock };
}

const paid = { id: 'pay-0001-abcd', type: 'supply.paid', supplierId: 'sunil', amount: 1250000, from: 'bank', spot: 0 };

test("the phone's payment waits in the cloud with who, when and which shop filled in, until the shop server takes it", async () => {
  const { call } = await setup();
  // The phone says only what happened; it cannot say who or which shop.
  const sent = await call('/api/v1/inbox', 'phone-a', { event: { ...paid, shopId: 'other-shop', actor: { id: 'x', name: 'Someone', role: 'cashier' }, at: 1 } });
  assert.equal(sent.status, 200);
  assert.equal((await call('/api/v1/inbox', 'phone-a', { event: paid })).status, 200, 'sending it again is harmless');

  const waiting = await call('/api/v1/inbox', 'server-a');
  assert.equal(waiting.body.events.length, 1);
  assert.deepEqual(waiting.body.events[0], {
    ...paid, shopId: SHOP, at: 5_000_000, orderNumber: 0, actor: { id: 'phone-dev-phone-a', name: 'Owner (phone)', role: 'owner' },
  });
  assert.equal((await call('/api/v1/inbox', 'server-b')).body.events.length, 0, "another shop's server never sees it");

  assert.deepEqual((await call('/api/v1/inbox/taken', 'server-a', { ids: [paid.id] })).body, { taken: 1 });
  assert.equal((await call('/api/v1/inbox', 'server-a')).body.events.length, 0, 'taken: not handed out again');
});

test('the phone records Pay out only, well formed; only shop servers take; only phones send', async () => {
  const { call } = await setup();
  assert.equal((await call('/api/v1/inbox', 'phone-a', { event: { ...paid, type: 'order.paid' } })).status, 400);
  assert.equal((await call('/api/v1/inbox', 'phone-a', { event: { ...paid, amount: -5 } })).status, 400);
  assert.equal((await call('/api/v1/inbox', 'phone-a', { event: { ...paid, id: 'x' } })).status, 400);
  assert.equal((await call('/api/v1/inbox', 'phone-a', { nothing: true })).status, 400);
  assert.equal((await call('/api/v1/inbox', 'server-a', { event: paid })).status, 403, 'the shop server does not send');
  assert.equal((await call('/api/v1/inbox', 'phone-a')).status, 403, 'a phone does not take');
  assert.equal((await call('/api/v1/inbox', 'nobody', { event: paid })).status, 401);
});
