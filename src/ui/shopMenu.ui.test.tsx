import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Root } from './Root.tsx';

// The real shop's menu (Bata Kade's, folded under the shop's own menu events), not the printed one tests use.
beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('MODE', 'production');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  history.replaceState(null, '', '/');
});

const go = async (hash: string) => {
  await act(async () => {
    history.replaceState(null, '', `/${hash}`);
    dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 20));
  });
};

test("Cash out, then the Register: still Bata Kade's menu (the shop's history never drops it)", async () => {
  history.replaceState(null, '', '/#cashout');
  render(<Root />);
  expect(await screen.findByPlaceholderText(/fish 4500/)).toBeTruthy();
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); // the shop's history has loaded
  await go('');
  expect(await screen.findByText('Special Rice')).toBeTruthy();
  expect(screen.queryByText('Margherita')).toBeNull();
});

test("the Menu screen is Bata Kade's: its own sections only, no CheesyBeez, no stock, recipes or costs", async () => {
  history.replaceState(null, '', '/#menu');
  render(<Root />);
  expect(await screen.findByRole('heading', { name: 'Menu' })).toBeTruthy();
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); // the shop's history has loaded
  const tabs = screen.getAllByRole('button').filter((b) => b.closest('nav[aria-label="Menu sections"]')).map((b) => b.textContent);
  expect(tabs).toContain('Kottu');
  for (const printed of ['Pizza', 'Burgers', 'Pasta']) expect(tabs).not.toContain(printed);
  expect(screen.getByText('Vegetable Rice & Curry')).toBeTruthy(); // the first section is open
  const page = screen.getByRole('main', { name: 'Menu' }).textContent ?? '';
  expect(page).not.toMatch(/cheesybeez|Margherita|Stock value|Raw materials|Warehouses|recipe|Cost /i);
});
