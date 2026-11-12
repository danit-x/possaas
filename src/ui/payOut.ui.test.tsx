import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FAKE_STAFF } from '../fake/data.ts';
import { appendEvent, readAll } from './eventLog.ts';
import { Root } from './Root.tsx';

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => cleanup());

const actor = { id: 'm', name: 'Ravi', role: 'manager' as const };
const managerPin = FAKE_STAFF.find((s) => s.actor.role === 'manager')!.pin;

test('Pay out: F7 from the Register; a supplier, a bill and a payment from the drawer, one PIN for the visit', async () => {
  const user = userEvent.setup();
  render(<Root />);
  await user.keyboard('{F7}');
  expect(await screen.findByRole('heading', { name: 'Pay out' })).toBeTruthy();

  // No suppliers yet: the screen asks for the first one.
  await user.type(screen.getByLabelText('Name'), 'Sunil · chicken{Enter}');
  await screen.findByRole('dialog', { name: 'Manager PIN' });
  await user.keyboard(managerPin);
  const panel = await screen.findByRole('region', { name: 'Sunil · chicken' });

  // A bill: type it, Enter. No second PIN.
  await user.type(within(panel).getByLabelText('Amount'), '12,500{Enter}');
  expect(within(panel).getByText(/owed/).textContent).toContain('Rs 12,500');
  expect(screen.getByRole('button', { name: /Sunil · chicken/ }).textContent).toContain('12,500');

  // Pay what is owed (Shift+Enter with nothing typed), from the drawer.
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  expect(within(panel).getByText('Nothing owed')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Paid Sunil · chicken Rs 12,500 from the drawer');

  const supply = readAll().filter((e) => e.type.startsWith('supply.'));
  expect(supply.map((e) => e.type)).toEqual(['supply.supplier_set', 'supply.billed', 'supply.paid']);
  expect(supply.every((e) => 'actor' in e && e.actor.role === 'manager')).toBe(true);
  expect(supply[2]).toMatchObject({ amount: 1250000, from: 'drawer', spot: 0, orderNumber: 0 });

  // Undo takes the payment back.
  await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
  expect(within(panel).getByText(/owed/).textContent).toContain('Rs 12,500');
});

test('Close the day: cash paid from the drawer is expected out of it, not "short"', async () => {
  appendEvent({ type: 'order.paid', at: Date.now() - 60_000, orderNumber: 1001, actor, total: 5200000, tender: 'cash', tendered: 5200000 });
  appendEvent({ type: 'supply.supplier_set', at: Date.now() - 50_000, orderNumber: 0, actor, supplierId: 'sunil', name: 'Sunil' });
  appendEvent({ type: 'supply.paid', at: Date.now() - 40_000, orderNumber: 0, actor, supplierId: 'sunil', amount: 2450000, from: 'drawer', spot: 2450000 });
  history.replaceState(null, '', '/#close');
  const user = userEvent.setup();
  render(<Root />);
  expect((await screen.findByText('Paid out')).closest('div')!.textContent).toContain('24,500');
  await user.type(screen.getByLabelText('Cash in the drawer at opening'), '5000');
  expect(screen.getByText('Cash expected now').textContent).toContain('Rs 32,500');
  await user.type(screen.getByLabelText('Cash counted now'), '32500');
  expect(screen.getByRole('status').textContent).toBe('Exact');
});
