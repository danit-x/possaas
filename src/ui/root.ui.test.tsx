import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Root } from './Root.tsx';
import { setKitchenScreen } from './kitchenScreen.ts';

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(cleanup);

const kitchen = () => within(screen.getByRole('main', { name: 'Orders to make' }));

const sendOne = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Devilled Chicken/ }));
  await user.click(screen.getByRole('button', { name: /Large/ }));
  await user.click(screen.getByRole('button', { name: /^Add ·/ }));
  await user.click(screen.getByRole('button', { name: 'Send to kitchen' }));
};

test('one counter PC: the Kitchen key opens the Kitchen, F2 goes back, the chip shows what is left to make, Space bumps the oldest', async () => {
  const user = userEvent.setup();
  render(<Root />);
  expect(screen.getByRole('button', { name: 'Kitchen: nothing to make' })).toBeTruthy();

  await sendOne(user);
  expect(screen.getByRole('button', { name: 'Kitchen: 1 to make, oldest waiting 00:00' })).toBeTruthy();

  await user.click(screen.getByRole('button', { name: /^Kitchen:/ }));
  expect(location.hash).toBe('#kitchen');
  expect(kitchen().getByRole('article', { name: 'Order 1001' })).toBeTruthy();

  await user.keyboard(' '); // Start
  expect(kitchen().getByRole('button', { name: 'Done: Order 1001' })).toBeTruthy();
  await user.keyboard(' '); // Done
  expect(kitchen().getByText('No orders waiting')).toBeTruthy();

  await user.keyboard('{Control>}z{/Control}');
  expect(kitchen().getByRole('article', { name: 'Order 1001' })).toBeTruthy();

  await user.keyboard('{F2}');
  expect(location.hash).toBe('');
  expect(screen.getByRole('complementary', { name: 'Current order' })).toBeTruthy();

  // Touch works too: the chip opens the Kitchen, the Register key (or Esc) comes back.
  await user.click(screen.getByRole('button', { name: /^Kitchen: 1 to make/ }));
  await user.click(screen.getByRole('button', { name: /^Register/ }));
  expect(screen.getByRole('complementary', { name: 'Current order' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /^Kitchen:/ }));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('complementary', { name: 'Current order' })).toBeTruthy();
});

test('a kitchen device opened at /#kitchen has no Register key', () => {
  history.replaceState(null, '', '/#kitchen');
  render(<Root />);
  expect(kitchen().getByText('No orders waiting')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Register/ })).toBeNull();
});

test('the parts: Sell, Today and Cash out, then the Menu, then Settings; every part keeps its place; Sell goes to the register', async () => {
  const user = userEvent.setup();
  history.replaceState(null, '', '/#menu');
  render(<Root />);
  const nav = () => within(screen.getByRole('navigation', { name: 'Owner sections' }));
  const names = () => nav().getAllByRole('link').map((a) => a.getAttribute('aria-label'));
  const current = () => nav().getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('aria-label'));
  const parts = ['Sell', 'Today', 'Cash out', 'Menu', 'Settings'];
  expect(nav().getAllByRole('heading').map((h) => h.textContent)).toEqual(['Work', 'Things']);
  for (const [link, main] of [['Today', 'Owner'], ['Cash out', 'Cash out'], ['Menu', 'Menu'], ['Settings', 'Shop setup']]) {
    await user.click(nav().getByRole('link', { name: link }));
    expect(await screen.findByRole('main', { name: main })).toBeTruthy();
    expect(names()).toEqual(parts);
    expect(current()).toEqual([link]);
  }
  expect(await nav().findByText('No sales yet today')).toBeTruthy();
  expect(nav().getByText('Nothing out today')).toBeTruthy();
  await user.click(nav().getByRole('link', { name: 'Sell' }));
  expect(await screen.findByRole('complementary', { name: 'Current order' })).toBeTruthy();
});

test('Cash out from the Register (F1): one line with a manager PIN, Undo takes it off; every line is a synced event', async () => {
  const user = userEvent.setup();
  render(<Root />);
  await user.keyboard('{F1}');
  expect(await screen.findByRole('main', { name: 'Cash out' })).toBeTruthy();
  await user.keyboard('fish 4500{Enter}');
  if (screen.queryByRole('dialog')) await user.keyboard('2580'); // a cashier on the counter: a manager's PIN, once
  expect(await screen.findByText('Fish 4,500 added')).toBeTruthy();
  const today = within(screen.getByRole('region', { name: 'Cash out today' }));
  expect(today.getByText('Fish')).toBeTruthy();
  const { readAll } = await import('./eventLog.ts');
  const line = readAll().find((e) => e.type === 'cash.out');
  expect(line && 'amount' in line ? [line.name, line.amount, Boolean(line.shopId)] : null).toEqual(['Fish', 450000, true]);
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await today.findByText(/Nothing yet today/)).toBeTruthy();
  await user.keyboard('{F1}');
  expect(await screen.findByRole('complementary', { name: 'Current order' })).toBeTruthy();
});

test('on a narrow screen the parts open as a drawer from the menu button', async () => {
  const user = userEvent.setup();
  history.replaceState(null, '', '/#menu');
  render(<Root />);
  const open = screen.getByRole('button', { name: 'Show the parts of the shop' });
  expect(open.getAttribute('aria-expanded')).toBe('false');
  await user.click(open);
  expect(open.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('navigation', { name: 'Owner sections' }).classList.contains('side--open')).toBe(true);
  await user.keyboard('{Escape}');
  expect(open.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('main', { name: 'Menu' })).toBeTruthy(); // Esc closed the drawer, not the Menu
});

// These tests are about the kitchen flow: the Kitchen view on (it is off on a new counter).
beforeEach(() => setKitchenScreen(true));
