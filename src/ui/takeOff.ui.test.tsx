import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAMPLE_START, menuItems, setMenuState, setStartingMenu } from '../domain/menu.ts';
import { EMPTY_MENU_STATE, EMPTY_START } from '../domain/menuEdits.ts';
import { FAKE_STAFF } from '../fake/data.ts';
import { App } from './App.tsx';
import { appendEvent, readAll } from './eventLog.ts';
import { Root } from './Root.tsx';

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); setMenuState(EMPTY_MENU_STATE); });
afterEach(() => { cleanup(); setMenuState(EMPTY_MENU_STATE); setStartingMenu(SAMPLE_START); });

const manager = () => FAKE_STAFF.find((x) => x.actor.role === 'manager')!;

test('the owner takes an item off the menu: at once, gone from the Menu screen, the counter and typing; Undo puts it back', async () => {
  const user = userEvent.setup();
  history.replaceState(null, '', '/#menu');
  render(<Root />);
  await user.click(await screen.findByRole('button', { name: 'Change Margherita' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Change Margherita' })).getByRole('button', { name: 'Take off the menu' }));

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Margherita is off the menu');
  expect(screen.queryByRole('button', { name: 'Change Margherita' })).toBeNull();
  expect(readAll().filter((e) => e.type === 'menu.item_set').at(-1)).toMatchObject({ itemId: 'margherita', after: { removed: true } });
  // Kept for old orders, offered nowhere.
  expect(menuItems().find((m) => m.id === 'margherita')).toMatchObject({ hidden: true, removed: true });

  await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Change Margherita' })).toBeTruthy();
  expect(menuItems().find((m) => m.id === 'margherita')?.removed).toBeUndefined();
});

test("a manager takes the shop's own item off on the Register, as the manager; Undo brings it back as it was", async () => {
  setStartingMenu(EMPTY_START);
  const base = { orderNumber: 0, actor: { id: 'o', name: 'Owner', role: 'owner' as const }, at: Date.now() } as const;
  appendEvent({ ...base, type: 'menu.section_set', sectionId: 'sec-kottu', section: { name: 'Kottu', cookMinutes: 8, sizes: [], adds: [] } });
  const kottu = { category: 'sec-kottu', name: { en: 'Egg Kottu' }, description: '', prices: { one: 45000 } };
  appendEvent({ ...base, type: 'menu.item_added', itemId: 'new-egg-kottu', item: kottu });
  appendEvent({ ...base, type: 'menu.item_added', itemId: 'new-chicken-kottu', item: { ...kottu, name: { en: 'Chicken Kottu' }, prices: { one: 50000 } } });
  const user = userEvent.setup();
  render(<App />);
  await user.keyboard('{Control>}m{/Control}');
  await user.keyboard(manager().pin);
  await user.click(screen.getByRole('button', { name: '450' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Change Egg Kottu' })).getByRole('button', { name: 'Take off the menu' }));

  expect(readAll().filter((e) => e.type === 'menu.item_added').at(-1)).toMatchObject({ itemId: 'new-egg-kottu', item: null, actor: manager().actor });
  expect(screen.queryByRole('button', { name: '450' })).toBeNull();
  expect(screen.getByRole('button', { name: '500' })).toBeTruthy(); // the other kottu stays

  await user.keyboard('{Control>}z{/Control}');
  expect(readAll().filter((e) => e.type === 'menu.item_added').at(-1)).toMatchObject({ itemId: 'new-egg-kottu', item: kottu });
  expect(screen.getByRole('button', { name: '450' })).toBeTruthy();
});
