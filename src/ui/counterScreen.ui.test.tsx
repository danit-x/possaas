import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.tsx';
import { readFileSync } from 'node:fs';

// The shop's counter is a small, nearly square screen (1024×768, often at 125%). jsdom has no layout,
// so these check what the layout depends on; the sizes themselves were checked in a browser.
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const css = readFileSync('src/ui/styles.css', 'utf8'); // vitest stubs CSS imports
const rule = (selector: string): string => css.split(/\r?\n/).find((line) => line.startsWith(`${selector} {`)) ?? '';

test('the section bar never shrinks away under a long menu, and wraps instead of hiding sections', () => {
  expect(rule('.cats')).toMatch(/flex: none/);
  expect(rule('.cats')).toMatch(/flex-wrap: wrap/);
  expect(css).toMatch(/@media \(max-width: 1180px\), \(max-height: 820px\)/);
});

test('Alt+1 … Alt+9 pick a section; a digit alone still starts typing an order', async () => {
  const user = userEvent.setup();
  render(<App />);
  const tabs = screen.getAllByRole('button', { pressed: false }).filter((b) => b.closest('.cats'));
  await user.keyboard('{Alt>}2{/Alt}');
  expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
  await user.keyboard('{Alt>}1{/Alt}');
  expect(screen.getByRole('button', { name: 'Popular' }).getAttribute('aria-pressed')).toBe('true');
  await user.keyboard('2');
  expect(screen.getByRole('textbox')).toBeTruthy();
});

test('"More" opens the folded corner keys and closes when one is used', async () => {
  const user = userEvent.setup();
  render(<App onCashOut={() => {}} />);
  const more = screen.getByRole('button', { name: 'More' });
  expect(screen.getByRole('button', { name: /^Cash out/ }).closest('.corner__rest')).not.toBeNull();
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await user.click(more);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  await user.click(screen.getByRole('button', { name: /^Busy/ }));
  expect(more.getAttribute('aria-expanded')).toBe('false');
  // Busy stays in sight while it is on, outside the folded keys.
  expect(screen.getByRole('button', { name: /^Busy · no bill/ }).closest('.corner__rest')).toBeNull();
});
