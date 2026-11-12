import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SyncEvent } from '../domain/sync.ts';
import { resetPhoneWaiting } from '../services/phonePayOut.ts';
import { Root } from './Root.tsx';

const ravi = { id: 'm', name: 'Ravi', role: 'manager' as const };
const shopEvents: SyncEvent[] = [
  { type: 'supply.supplier_set', id: 's1', shopId: 'shop', at: Date.now() - 3 * 86_400_000, actor: ravi, orderNumber: 0, supplierId: 'sunil', name: 'Sunil · chicken' },
  { type: 'supply.billed', id: 's2', shopId: 'shop', at: Date.now() - 2 * 86_400_000, actor: ravi, orderNumber: 0, supplierId: 'sunil', amount: 1250000 },
];

/** The cloud: the shop's events, and the inbox the phone posts to. */
const cloud = () => {
  const posted: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/v1/inbox')) {
      posted.push(JSON.parse(String(init!.body)).event);
      return Response.json({ id: 'ok' });
    }
    const events = shopEvents.map((event, i) => ({ event, deviceId: 'd', seq: i + 1, receivedAt: 0 }));
    const after = Number(new URL(url, 'https://cloud.test').searchParams.get('after'));
    return Response.json({ events: events.slice(after), lastSeq: events.length, more: false, serverTime: 0 });
  }));
  return posted;
};

beforeEach(() => {
  localStorage.clear();
  resetPhoneWaiting();
  vi.stubEnv('VITE_SITE', 'cloud');
  localStorage.setItem('cb.owner.token', 'secret');
  history.replaceState(null, '', '/#owner');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

test("the owner's phone pays a supplier by bank: it counts at once and goes to the shop through the cloud", async () => {
  const posted = cloud();
  const user = userEvent.setup();
  render(<Root />);
  await user.click(await screen.findByRole('button', { name: 'Pay out: Rs 0 today, Rs 12,500 still owed' }));
  const sheet = screen.getByRole('dialog', { name: 'Pay out' });
  await user.click(within(sheet).getByRole('button', { name: /Sunil · chicken/ }));
  await user.click(within(sheet).getByRole('button', { name: 'Paid by bank 12,500' }));

  expect(within(sheet).getByRole('status').textContent).toContain('Paid Sunil · chicken Rs 12,500 by bank');
  expect(within(sheet).getByText(/on the way to the shop PC/)).toBeTruthy();
  expect(within(within(sheet).getByRole('region', { name: 'Paid today' })).getByText('Bank')).toBeTruthy();
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  // The phone sends only what happened: the cloud fills in who, when and which shop.
  expect(posted[0]).toMatchObject({ type: 'supply.paid', supplierId: 'sunil', amount: 1250000, from: 'bank', spot: 0 });
  expect(posted[0]).not.toHaveProperty('actor');

  await user.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Pay out: Rs 12,500 today, Rs 0 still owed' })).toBeTruthy();
});
