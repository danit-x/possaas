import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FAKE_STAFF } from '../fake/data.ts';
import { appendEvent, readAll } from './eventLog.ts';
import { Root } from './Root.tsx';

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => cleanup());

const owner = { id: 'o', name: 'Owner', role: 'owner' as const };
const managerPin = FAKE_STAFF.find((s) => s.actor.role === 'manager')!.pin;
const list = () => screen.getByRole('region', { name: 'Cash out today' });

test('Cash out: F7 from the Register, "fish 4500" and Enter, one PIN for the visit, × and Undo', async () => {
  appendEvent({ type: 'cash.out', at: Date.now() - 2 * 86_400_000, orderNumber: 0, actor: owner, name: 'Bank', amount: 2000000 });
  const user = userEvent.setup();
  render(<Root />);
  await user.keyboard('{F7}');
  expect(await screen.findByRole('heading', { name: 'Cash out' })).toBeTruthy();

  // Written like the paper. The cashier at the screen does not write it: a manager's PIN, once.
  await user.type(screen.getByLabelText('Name and amount'), 'fish 4500{Enter}');
  await screen.findByRole('dialog', { name: 'Manager PIN' });
  await user.keyboard(managerPin);
  expect(within(list()).getByText('Fish')).toBeTruthy();
  expect(within(list()).getByText('Rs 4,500')).toBeTruthy();

  // A name used before is a button; no second PIN.
  await user.click(screen.getByRole('button', { name: 'Bank' }));
  await user.keyboard('20,000{Enter}');
  expect(within(list()).getByText('Rs 24,500')).toBeTruthy();
  expect(within(list()).getByText('2 items')).toBeTruthy();

  const written = readAll().filter((e) => e.type === 'cash.out' && e.at > Date.now() - 60_000);
  expect(written).toHaveLength(2);
  expect(written[0]).toMatchObject({ name: 'Fish', amount: 450000, orderNumber: 0, actor: { role: 'manager' } });

  // × takes a line off, Undo puts it back.
  await user.click(screen.getByRole('button', { name: 'Take off Fish 4,500' }));
  expect(within(list()).getByText('Rs 20,000')).toBeTruthy();
  await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
  expect(within(list()).getByText('Rs 24,500')).toBeTruthy();

  // Something that is not a name and an amount says how to write it.
  await user.type(screen.getByLabelText('Name and amount'), 'fish{Enter}');
  expect(screen.getByRole('alert').textContent).toContain('fish 4500');
});

test('Close the day: cash out is expected out of the drawer, not "short"', async () => {
  appendEvent({ type: 'order.paid', at: Date.now() - 60_000, orderNumber: 1001, actor: owner, total: 5200000, tender: 'cash', tendered: 5200000 });
  appendEvent({ type: 'cash.out', at: Date.now() - 50_000, orderNumber: 0, actor: owner, name: 'Fish', amount: 2450000 });
  history.replaceState(null, '', '/#close');
  const user = userEvent.setup();
  render(<Root />);
  expect((await screen.findByText(/^Cash out/, { selector: 'dt' })).closest('div')!.textContent).toContain('24,500');
  await user.type(screen.getByLabelText('Cash in the drawer at opening'), '5000');
  expect(screen.getByText('Cash expected now').textContent).toContain('Rs 32,500');
  await user.type(screen.getByLabelText('Cash counted now'), '32500');
  expect(screen.getByRole('status').textContent).toBe('Exact');
});

test("Owner view: today's cash out in one card; one tap opens Cash out", async () => {
  appendEvent({ type: 'cash.out', at: Date.now() - 60_000, orderNumber: 0, actor: owner, name: 'Fish', amount: 450000 });
  appendEvent({ type: 'cash.out', at: Date.now() - 30_000, orderNumber: 0, actor: owner, name: 'Bank', amount: 2000000 });
  history.replaceState(null, '', '/#owner');
  const user = userEvent.setup();
  render(<Root />);
  const box = await screen.findByRole('button', { name: 'Cash out today: Rs 24,500, 2 items' });
  expect(box.textContent).toContain('Fish, Bank');
  await user.click(box);
  expect(await screen.findByRole('heading', { name: 'Cash out' })).toBeTruthy();
  expect(location.hash).toBe('#cashout');
});
