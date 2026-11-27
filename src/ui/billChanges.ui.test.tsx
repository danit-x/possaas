import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { heldList } from './testHeld.ts';
import { App } from './App.tsx';
import { Kitchen } from './Kitchen.tsx';
import { readEvents } from './eventLog.ts';
import { setKitchenScreen } from './kitchenScreen.ts';

// Changes to a bill at the counter: what the customer eats and what they pay. No manager mode,
// no PIN (owner, 2026-11-25); every change is audited under the cashier's own name, with Undo.

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); });

type User = ReturnType<typeof userEvent.setup>;
const panel = () => within(screen.getByRole('complementary', { name: 'Current order' }));
const kitchen = () => within(screen.getByRole('main', { name: 'Orders to make' }));
const total = () => screen.getByRole('complementary', { name: 'Current order' }).querySelector('.total')!.textContent;
const auditEvents = () => readEvents().filter((e) => 'totalBefore' in e);
/** The bill's Discount line: tapping it opens the chips, Free and "Price off". */
const openDiscount = (user: User) => user.click(panel().getByRole('button', { name: /^Discount/ }));
const chip = (name: string | RegExp) => panel().getByRole('button', { name });

/** 1001 = Margherita M (1,450) + Chicken Burger (450) = 1,900, sent, then opened from the Orders list. */
const sendAndReopen = async (user: User) => {
  await user.click(screen.getAllByRole('button', { name: 'M 1,450' })[0]);
  await user.click(screen.getAllByRole('button', { name: '450' })[0]);
  await user.click(screen.getByRole('button', { name: 'Send to kitchen' }));
  await user.click(heldList().getByRole('button', { name: /^1001/ }));
};

test('no manager mode: no Manager key, Ctrl+M asks for nothing, no command palette', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndReopen(user);
  expect(screen.queryByRole('button', { name: /^Manager/ })).toBeNull();
  await user.keyboard('{Control>}m{/Control}');
  await user.keyboard('{Control>}k{/Control}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText(/^Managing/)).toBeNull();
  expect(screen.queryByLabelText(/PIN/)).toBeNull();
});

test('discounts are behind the Discount line, for any cashier: exact cent totals; Free says "Free · Undo"; Undo restores it', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndReopen(user);
  // Out of the way until asked for.
  expect(panel().queryByRole('group', { name: 'Order discount' })).toBeNull();
  await openDiscount(user);
  expect(panel().getByRole('group', { name: 'Order discount' })).toBeTruthy();
  expect(total()).toBe('1,900');
  await user.click(chip('10% off'));
  expect(total()).toBe('1,710');
  await user.click(chip('20% off'));
  expect(total()).toBe('1,520');
  await user.click(chip('50% off'));
  expect(total()).toBe('950');
  await user.click(chip('Free (comp the whole order)'));
  expect(total()).toBe('0');
  expect((document.querySelector('.toast') as HTMLElement).textContent).toBe('FreeUndo');
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.comped', actor: { role: 'cashier' } });

  await user.keyboard('{Control>}z{/Control}');
  expect(total()).toBe('950'); // back to exactly the 50% state
  await user.click(chip('50% off')); // the active chip again removes it
  expect(total()).toBe('1,900');
});

test('Price off the selected item, in cents, without touching the menu price; the bill says who changed it', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndReopen(user);
  await user.keyboard('{ArrowUp}'); // the burger is selected: up to the Margherita
  await openDiscount(user);
  await user.click(chip('Price off Margherita'));
  await user.keyboard('150.50{Enter}');
  expect(panel().getByText('−150.50 off this line')).toBeTruthy();
  expect(total()).toBe('1,749.50');
  expect(panel().getByText(/^Edited by Nimal, /)).toBeTruthy();
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.line_adjusted', before: 0, after: 15050, totalBefore: 190000, totalAfter: 174950, actor: { role: 'cashier' } });
  expect(screen.getAllByRole('button', { name: 'M 1,450' }).length).toBeGreaterThan(0); // menu price unchanged
});

test('the price box takes only rupees, refuses 0, Remove takes it off, and Esc closes it without a new bill (SCRUM-137)', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndReopen(user);
  await openDiscount(user);
  await user.click(chip('Price off Chicken Burger')); // the last line is selected
  const box = () => screen.getByRole('textbox', { name: 'Take off Chicken Burger' }) as HTMLInputElement;
  await user.keyboard('abc');
  expect(box().value).toBe(''); // letters never appear
  const before = auditEvents().length;
  await user.keyboard('0{Enter}');
  expect(auditEvents().length).toBe(before); // 0 never secretly removes anything
  await user.clear(box());
  await user.keyboard('100{Enter}');
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.line_adjusted', after: 10000 });
  await user.click(chip('Price off Chicken Burger'));
  await user.click(screen.getByRole('button', { name: /^Remove the Rs 100/ }));
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.line_adjusted', before: 10000, after: 0 });

  await user.click(chip('Price off Chicken Burger'));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('textbox', { name: 'Take off Chicken Burger' })).toBeNull();
  expect(total()).toBe('1,900'); // still bill 1001
});

test('every change is exactly one audit entry with the cashier’s name and before/after in whole cents', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndReopen(user);
  await openDiscount(user);
  await user.click(chip('10% off'));
  await user.click(chip('Price off Chicken Burger'));
  await user.keyboard('100{Enter}');
  await user.click(chip('Free (comp the whole order)'));
  await user.keyboard('{Control>}z{/Control}');
  const audit = auditEvents();
  expect(audit.map((e) => e.type)).toEqual(['order.discount_set', 'order.line_adjusted', 'order.comped', 'order.change_undone']);
  for (const e of audit) {
    expect(e.actor).toMatchObject({ name: 'Nimal', role: 'cashier' });
    expect(Number.isInteger((e as { totalBefore: number }).totalBefore)).toBe(true);
    expect(Number.isInteger((e as { totalAfter: number }).totalAfter)).toBe(true);
    expect(e.shopId).toBeTruthy();
  }
});

test('a comped order closes with "Close · Free" and shows as Paid · Free', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndReopen(user);
  await openDiscount(user);
  await user.click(chip('Free (comp the whole order)'));
  await user.click(screen.getByRole('button', { name: 'Close · Free' }));
  await user.click(screen.getByRole('button', { name: 'New bill' }));
  expect(within(screen.getByRole('region', { name: 'Paid today' })).getByText('Paid · Free')).toBeTruthy();
  expect(readEvents().at(-1)).toMatchObject({ type: 'order.paid', total: 0, tender: 'comp' });
});

test('void a sent line: no PIN, no reason asked; Undo restores it in its original position, and the kitchen follows', async () => {
  const user = userEvent.setup();
  render(<><App /><Kitchen /></>);
  // Three lines, so "original position" means the middle one comes back in the middle.
  await user.click(screen.getAllByRole('button', { name: 'M 1,450' })[0]);
  await user.click(screen.getAllByRole('button', { name: '450' })[0]);
  await user.click(screen.getAllByRole('button', { name: '650' })[0]);
  await user.click(screen.getByRole('button', { name: 'Send to kitchen' }));
  await user.click(heldList().getByRole('button', { name: /^1001/ }));

  await user.keyboard('{ArrowUp}{Delete}'); // the last line is selected: up to the middle one
  expect(panel().queryByText('Chicken Burger')).toBeNull();
  expect(kitchen().getByText('Cancelled')).toBeTruthy();
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.item_cancelled', reason: 'Before it was made', index: 1, actor: { role: 'cashier' } });

  await user.keyboard('{Control>}z{/Control}');
  const names = [...screen.getByRole('complementary', { name: 'Current order' }).querySelectorAll('.line__name')].map((el) => el.textContent);
  expect(names).toEqual(['Margherita', 'Chicken Burger', 'Crispy Chicken Burger']);
  expect(kitchen().queryByText('Cancelled')).toBeNull();
  expect(auditEvents().at(-1)?.type).toBe('order.change_undone');
});

test('the customer changed their mind: the cashier changes a sent line, no PIN, no reason; the kitchen sees it; Undo', async () => {
  const user = userEvent.setup();
  render(<><App /><Kitchen /></>);
  await sendAndReopen(user);
  await user.click(panel().getByRole('button', { name: /^Margherita/ }));
  const sheet = within(screen.getByRole('region', { name: / extras$/ }));
  expect(sheet.queryByText('Reason')).toBeNull();
  expect(sheet.queryByText(/Already made/)).toBeNull();
  await user.click(sheet.getByRole('button', { name: /^Large/ }));
  await user.click(sheet.getByRole('button', { name: /^Update/ }));
  expect(total()).toBe('2,440');
  expect(screen.getByRole('status').textContent).toContain('Changed Margherita · kitchen told');
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.item_changed', reason: 'Before it was made', actor: { role: 'cashier' } });
  expect('made' in auditEvents().at(-1)!).toBe(false);
  expect(within(kitchen().getByRole('article', { name: /^Order 1001/ })).getByText('Changed')).toBeTruthy();

  await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
  expect(total()).toBe('1,900');
  expect(auditEvents().at(-1)?.type).toBe('order.change_undone');
});

test('a line the kitchen already made says Made; removing it says nothing of waste but the record keeps that it was made', async () => {
  const user = userEvent.setup();
  render(<><App /><Kitchen /></>);
  await sendAndReopen(user);
  await user.click(kitchen().getByRole('button', { name: 'Start: Order 1001' }));
  await user.click(kitchen().getByRole('button', { name: 'Done: Order 1001' }));
  const burger = panel().getByRole('button', { name: /^Chicken Burger/ });
  expect(within(burger).getByText('Made')).toBeTruthy();
  await user.click(burger);
  const sheet = within(screen.getByRole('region', { name: / extras$/ }));
  expect(sheet.getByText('Made already')).toBeTruthy();
  expect(sheet.queryByText(/waste/i)).toBeNull(); // Bata Kade keeps no waste (owner, 2026-11-25)
  await user.click(sheet.getByRole('button', { name: 'Remove' }));
  // Taking a sent line off: at once, no PIN (owner, 2026-11-17); the record says it had been made.
  expect(total()).toBe('1,450');
  expect(screen.getAllByRole('status').some((s) => /waste/i.test(s.textContent ?? ''))).toBe(false);
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.item_cancelled', reason: 'Already made', made: true });
  await user.click(panel().getByRole('button', { name: /^Margherita/ }));
  await user.click(within(screen.getByRole('region', { name: / extras$/ })).getByRole('button', { name: /^Large/ }));
  // Made already: throwing it away and making a new one is picked for the cashier.
  await user.click(within(screen.getByRole('region', { name: / extras$/ })).getByRole('button', { name: /^Make new/ }));
  // Ctrl+Z undoes the newest change only.
  await user.keyboard('{Control>}z{/Control}');
  expect(total()).toBe('1,450');
});

test('cashier rules kept: sends share the event log; Undo of a send only straight after it', async () => {
  const user = userEvent.setup();
  render(<><App /><Kitchen /></>);
  await user.click(screen.getAllByRole('button', { name: 'M 1,450' })[0]);
  await user.click(screen.getByRole('button', { name: 'Send to kitchen' }));
  await user.click(screen.getAllByRole('button', { name: '450' })[0]); // next customer: the send is sealed
  await user.keyboard('{Control>}z{/Control}{Control>}z{/Control}');
  expect(kitchen().getByRole('article', { name: 'Order 1001' })).toBeTruthy();
  expect(readEvents().map((e) => e.type)).toEqual(['order.sent']);
  expect(readEvents()[0].shopId).toBeTruthy();
});

/** 1001 sent and paid in exact cash: the paid order stays on screen. */
const sendAndPay = async (user: User) => {
  await sendAndReopen(user);
  await user.click(screen.getByRole('button', { name: 'Pay' }));
  await user.click(screen.getByRole('button', { name: /Exact cash/ }));
};
const settledEvents = () => readEvents().filter((e) => e.type === 'order.settled');

test('a paid bill offers no discount: what was paid is paid', async () => {
  const user = userEvent.setup();
  render(<App />);
  await sendAndPay(user);
  expect(panel().queryByRole('button', { name: /^Discount/ })).toBeNull();
});

test('changed after paying (SCRUM-242): change the ticket, charge only the difference; take one off, give back cash', async () => {
  const user = userEvent.setup();
  render(<><App /><Kitchen /></>);
  await sendAndPay(user);

  // Medium to Large, before the kitchen started: "Change the ticket" is picked for the cashier.
  await user.click(panel().getByRole('button', { name: /^Margherita/ }));
  let sheet = within(screen.getByRole('region', { name: / extras$/ }));
  expect(sheet.getByText('Not started in the kitchen')).toBeTruthy();
  expect(sheet.getByRole('radio', { name: /Change the ticket/ }).getAttribute('aria-checked')).toBe('true');
  await user.click(sheet.getByRole('button', { name: /^Large/ }));
  await user.click(sheet.getByRole('button', { name: /^Update/ }));
  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.item_changed', afterPay: true });
  expect(within(kitchen().getByRole('article', { name: /^Order 1001/ })).getByText('Changed')).toBeTruthy();

  // The money side asks for the difference, and Charge takes only that.
  await user.click(screen.getByRole('button', { name: 'Pay 540 more' }));
  await user.click(screen.getByRole('button', { name: /Exact cash 540/ }));
  expect(settledEvents().at(-1)).toMatchObject({ amount: 54000, tender: 'cash', orderNumber: 1001 });
  expect(panel().getByRole('button', { name: /^Margherita/ })).toBeTruthy(); // still on screen, settled

  // The burger taken off: Give back, cash from the drawer, one tap.
  await user.click(panel().getByRole('button', { name: /^Chicken Burger/ }));
  sheet = within(screen.getByRole('region', { name: / extras$/ }));
  await user.click(sheet.getByRole('button', { name: 'Remove' }));
  await user.click(screen.getByRole('button', { name: 'Give back 450' }));
  expect(settledEvents().at(-1)).toMatchObject({ amount: -45000, tender: 'cash' });
  expect(screen.queryByRole('button', { name: /Give back/ })).toBeNull();
});

test('changed after paying, already cooking (SCRUM-242): throw away + make new sends a new ticket; the old one is struck', async () => {
  const user = userEvent.setup();
  render(<><App /><Kitchen /></>);
  await sendAndPay(user);
  await user.click(kitchen().getByRole('button', { name: 'Start: Order 1001' }));

  await user.click(panel().getByRole('button', { name: /^Margherita/ }));
  const sheet = within(screen.getByRole('region', { name: / extras$/ }));
  expect(sheet.getByText('Cooking in the kitchen')).toBeTruthy();
  expect(sheet.getByRole('radio', { name: /Make a new one/ }).getAttribute('aria-checked')).toBe('true');
  await user.click(sheet.getByRole('button', { name: /^Large/ }));
  await user.click(sheet.getByRole('button', { name: /^Make new/ }));

  expect(auditEvents().at(-1)).toMatchObject({ type: 'order.item_changed', made: true, remake: true, afterPay: true, reason: 'Thrown away, made again' });
  const tickets = kitchen().getAllByRole('article', { name: /^Order 1001/ });
  expect(tickets).toHaveLength(2);
  expect(within(tickets[0]).getByText('Thrown away · new ticket')).toBeTruthy();
  expect(within(tickets[1]).getByText('Remake · customer changed')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pay 540 more' })).toBeTruthy();

  // The cashier's Undo takes it all back: one ticket, nothing owed.
  const toast = screen.getAllByRole('status').find((s) => s.textContent?.includes('made again, new ticket'))!;
  await user.click(within(toast).getByRole('button', { name: 'Undo' }));
  expect(kitchen().getAllByRole('article', { name: /^Order 1001/ })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /Pay .* more/ })).toBeNull();
});

// These tests are about the kitchen flow: the Kitchen view on (it is off on a new counter).
beforeEach(() => setKitchenScreen(true));
