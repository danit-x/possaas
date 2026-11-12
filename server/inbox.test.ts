import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SyncEvent } from '../src/domain/sync.ts';
import { startInbox } from './inbox.ts';

const SHOP = 'shop-1';
const owner = { id: 'phone-dev-1', name: 'Owner (phone)', role: 'owner' };
const paid = { id: 'pay-1', type: 'supply.paid', shopId: SHOP, at: 1000, actor: owner, orderNumber: 0, supplierId: 's', amount: 500000, from: 'bank', spot: 0 };

/** The cloud's inbox: what it hands out, and the ids the server said it took. */
const cloud = (waiting: unknown[]) => {
  const taken: string[][] = [];
  const fetchMock = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/inbox/taken')) { taken.push(JSON.parse(String(init!.body)).ids); return Response.json({ taken: 1 }); }
    return Response.json({ events: waiting });
  }) as typeof fetch;
  return { fetchMock, taken };
};

test("the shop server stores the phone's Pay out, then tells the cloud; anything it would refuse is dropped", async () => {
  const stray = [
    { ...paid, id: 'pay-2', actor: { ...owner, role: 'cashier' } }, // not the owner
    { ...paid, id: 'pay-3', type: 'order.paid' }, // not Pay out
    { ...paid, id: 'pay-4', shopId: 'other' }, // not this shop
  ];
  const { fetchMock, taken } = cloud([paid, ...stray]);
  const stored: SyncEvent[][] = [];
  const inbox = startInbox({ url: 'https://cloud.test', token: 't', tenantId: SHOP, fetch: fetchMock, every: 60_000, take: async (e) => { stored.push(e); } });
  await inbox.takeNow();
  inbox.stop();
  assert.deepEqual(stored[0].map((e) => e.id), ['pay-1']);
  assert.deepEqual(taken[0], ['pay-1', 'pay-2', 'pay-3', 'pay-4'], 'all taken off the cloud: the refused ones would never be accepted');
});

test('storing fails: nothing is confirmed, so the cloud hands it out again', async () => {
  const { fetchMock, taken } = cloud([paid]);
  const inbox = startInbox({ url: 'https://cloud.test', token: 't', tenantId: SHOP, fetch: fetchMock, every: 60_000, take: async () => { throw new Error('disk full'); } });
  await inbox.takeNow();
  inbox.stop();
  assert.equal(taken.length, 0);
});
