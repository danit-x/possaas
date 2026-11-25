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
