import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setShopDetails } from '../services/shop.ts';
import { Root } from './Root.tsx';

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => {
  cleanup();
  setShopDetails({ name: 'Test shop', place: '', footer: '', features: {} });
});

test('parts switched off on /admin leave the screens: no keys, no tab, F3 and F6 do nothing', async () => {
  setShopDetails({ name: 'Bata Kade', place: '', footer: '', features: { cashOut: false, busyMode: false, onlineOrders: false } });
  const user = userEvent.setup();
  render(<Root />);
  expect(await screen.findByRole('button', { name: /Charge|Send/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Cash out/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Busy/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Online/ })).toBeNull();
  await user.keyboard('{F3}');
  expect(screen.queryByRole('heading', { name: 'Cash out' })).toBeNull();
  cleanup();

  history.replaceState(null, '', '/#close');
  render(<Root />);
  expect(await screen.findByRole('heading', { name: 'Close the day' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Cash out' })).toBeNull();
});

test('switched back on, they are there again', async () => {
  setShopDetails({ name: 'Bata Kade', place: '', footer: '', features: {} });
  render(<Root />);
  expect(await screen.findByRole('button', { name: /Cash out/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Busy/ })).toBeTruthy();
});
