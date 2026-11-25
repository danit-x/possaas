import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Root } from './Root.tsx';

const FRIDAY_EVENING = new Date(2026, 9, 9, 20, 30);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: FRIDAY_EVENING, toFake: ['Date'] }); // only the clock: the demo history is built from "now"
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});

test('the demo Today: the shop at a glance, each part explained on the black screen, and the To do list with one tap each', async () => {
  history.replaceState(null, '', '/?demo#owner');
  const user = userEvent.setup();
  render(<Root />);
  const feed = within(await screen.findByRole('region', { name: 'Needs your attention' }));
  const cards = await feed.findAllByRole('article');
  // Bata Kade's own cards only: its sales, its staff, its menu. No stock, tables or cameras.
  const labels = cards.map((c) => c.getAttribute('aria-label') ?? '');
  expect(labels).toContain("Watalappan hasn't sold in 2 weeks");
  expect(labels.some((l) => /\bcameras?\b|\btables?\b|running low|recipe|Food costs/i.test(l))).toBe(false);
  expect(labels.some((l) => /BBQ|Pizza|Margherita/i.test(l))).toBe(false);
  // The stations: the kitchen, the counter, the money.
  expect(screen.queryByRole('button', { name: /^Shelves: / })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Deliveries: / })).toBeNull();
  const shopScreen = within(screen.getByRole('region', { name: 'Shop screen' }));
  expect(shopScreen.getByText('Today in a sentence')).toBeTruthy();
  // Tapping Money explains it there, with the day's Cash out; tapping it again goes back to the summary.
  await user.click(screen.getByRole('button', { name: /^Money: / }));
  expect(shopScreen.getByText(/^Money: Rs [\d,]+ taken today\./)).toBeTruthy();
  expect(shopScreen.getByRole('link', { name: 'See the records →' }).getAttribute('href')).toBe('#cashout');
  await user.click(screen.getByRole('button', { name: /^Money: / }));
  expect(shopScreen.getByText('Today in a sentence')).toBeTruthy();
}, 15_000); // the whole demo history, worked out twice

test('no history yet: a calm screen, not an empty error; nothing waits', async () => {
  history.replaceState(null, '', '/#owner');
  render(<Root />);
  expect(await screen.findByText('Nothing needs you right now.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sales today Rs 0' })).toBeTruthy(); // no history: no ring yet
});
