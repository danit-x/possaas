/**
 * One Back (nav.ts): Esc, the mouse's back button, Alt+← and the browser's Back all go to
 * where you just were; a sheet on top closes first; the Register is never left by accident.
 */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parentOf } from './nav.ts';
import { Root } from './Root.tsx';

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(cleanup);

const register = () => screen.findByRole('complementary', { name: 'Current order' });
const mouseBack = () => {
  fireEvent.mouseDown(window, { button: 3 });
  fireEvent.mouseUp(window, { button: 3 });
};

test('the place above: #items/recipe/x → #items/recipe → #items → the Register', () => {
  expect(parentOf('#items/recipe/margherita')).toBe('#items/recipe');
  expect(parentOf('#items/semi')).toBe('#items');
  expect(parentOf('#items')).toBe('');
  expect(parentOf('')).toBe('');
});

test('Esc with a sheet open closes the sheet only; the next Esc leaves the place', async () => {
  const user = userEvent.setup();
  history.replaceState(null, '', '/#menu');
  render(<Root />);
  await user.click(await screen.findByRole('button', { name: 'Change Margherita' }));
  expect(screen.getByRole('dialog', { name: 'Change Margherita' })).toBeTruthy();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Change Margherita' })).toBeNull();
  expect(screen.getByRole('main', { name: 'Menu' })).toBeTruthy();
  expect(location.hash).toBe('#menu');

  await user.keyboard('{Escape}');
  expect(await register()).toBeTruthy();
});

test("the mouse's back button and Alt+← are the same Back: sheet first, then the place", async () => {
  const user = userEvent.setup();
  render(<Root />);
  await register();
  location.hash = '#menu';
  await user.click(await screen.findByRole('button', { name: 'Change Margherita' }));

  mouseBack();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change Margherita' })).toBeNull());
  expect(location.hash).toBe('#menu');

  await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
  expect(await register()).toBeTruthy();
  expect(location.hash).toBe('');
});

test('on the Register, Back never leaves the app', async () => {
  const user = userEvent.setup();
  render(<Root />);
  await register();
  const before = history.length;
  mouseBack();
  await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
  await user.keyboard('{Escape}');
  expect(location.hash).toBe('');
  expect(history.length).toBe(before);
  expect(await register()).toBeTruthy();
});
