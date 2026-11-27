import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CounterTab } from './CounterTab.tsx';
import { kitchenScreenOn } from './kitchenScreen.ts';
import { soundOn } from './sound.ts';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); delete document.documentElement.dataset.theme; });

const group = (name: string) => within(screen.getByRole('radiogroup', { name }));

test('Settings › This counter: the kitchen screen, light or dark, and sound, kept on this screen', async () => {
  const user = userEvent.setup();
  render(<CounterTab />);
  // A new counter: no kitchen screen (kitchenScreen.ts), sound on.
  expect(group('Kitchen screen').getByRole('radio', { name: 'Hidden' }).getAttribute('aria-checked')).toBe('true');
  await user.click(group('Kitchen screen').getByRole('radio', { name: 'Shown' }));
  expect(kitchenScreenOn()).toBe(true);

  await user.click(group('Look').getByRole('radio', { name: 'Dark' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('cb.theme')).toBe('dark');
  await user.click(group('Look').getByRole('radio', { name: 'Follow Windows' }));
  expect(localStorage.getItem('cb.theme')).toBe('auto'); // a choice: the counter's light default no longer applies

  await user.click(group('Sound').getByRole('radio', { name: 'Off' }));
  expect(soundOn()).toBe(false);

  // It stays after a restart: a new screen reads what was chosen.
  cleanup();
  render(<CounterTab />);
  expect(group('Kitchen screen').getByRole('radio', { name: 'Shown' }).getAttribute('aria-checked')).toBe('true');
  expect(group('Look').getByRole('radio', { name: 'Follow Windows' }).getAttribute('aria-checked')).toBe('true');
  expect(group('Sound').getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
});
