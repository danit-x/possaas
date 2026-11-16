/**
 * Opening a page by voice (SCRUM-145): the pages a person may open, said in their words. Only
 * pages the person could already open with a key or the address are offered, so neither the
 * words nor the language model can take anyone further. Pure: Root decides who may open what.
 */

export interface VoicePage {
  id: string;
  /** What the model reads: what the page is for, in the shop's words. */
  label: string;
  /** Where it opens ('' = the Register). */
  hash: string;
  /** What staff call it, for the quick match that needs no model. */
  words: string[];
}

/** Who may open what, as Root already decides it. */
export interface PageAccess {
  seesOwner: boolean;
  owner: boolean;
  setup: boolean;
}

type Need = keyof PageAccess | null;

const PAGES: (VoicePage & { need: Need })[] = [
  { id: 'register', label: "Register: take a customer's order and charge it (e.g. new order, back to selling)", hash: '', words: ['register', 'till', 'counter', 'home'], need: null },
  { id: 'kitchen', label: "Kitchen screen: tickets to cook (e.g. what is cooking now)", hash: '#kitchen', words: ['kitchen', 'tickets'], need: null },
  { id: 'owner', label: "Owner view: takings and sales numbers (e.g. how much money today, how many kottu sold)", hash: '#owner', words: ['owner', 'takings', 'sales', 'dashboard'], need: 'seesOwner' },
  { id: 'cashout', label: "Cash out: cash taken from the drawer, fish, vegetables, gas, bank (e.g. we paid the fish man 4500)", hash: '#cashout', words: ['cash out', 'paid out', 'expenses'], need: null },
  { id: 'menu', label: "Menu: dish prices, names, sold out (e.g. make the egg kottu 500 rupees, hide a dish)", hash: '#items/finished', words: ['menu', 'prices', 'sold out'], need: 'seesOwner' },
  { id: 'setup', label: "Settings: staff and PINs, printer, devices, updates (e.g. new employee, printer broken)", hash: '#setup', words: ['setup', 'settings', 'staff', 'printer', 'updates'], need: 'setup' },
];

/** The pages this person may open. */
export const voicePages = (access: PageAccess): VoicePage[] =>
  PAGES.filter((p) => p.need === null || access[p.need]).map(({ need: _need, ...page }) => page);

/**
 * Words Whisper is told to expect (its starting prompt), so shop words come back spelled the way the
 * pages know them: the pages' own words, then what the shop sells and stocks.
 */
export const VOICE_HINT = [
  'Today\'s sales. Cash out. Menu, sold out, kitchen, register, settings.',
  'Rice and curry, kottu, egg kottu, chicken kottu, fried rice, biriyani, string hoppers, roti, milk tea, plain tea.',
].join(' ');

/** Lower case, English letters and digits only (hyphens, and Sinhala or Tamil script between the words, drop out). */
const normal = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

/**
 * The page the words name plainly ("open stock", "stock eka pennanna", "suppliers please"), or null
 * when it takes the model. The longer phrase wins: "show low stock" is low stock, not stock.
 */
export const matchPage = (text: string, pages: readonly VoicePage[]): VoicePage | null => {
  const said = normal(text);
  const hits = pages.flatMap((page) => page.words.map(normal).filter((w) => said.includes(w)).map((w) => ({ page, w })));
  const kept = hits.filter((h) => !hits.some((o) => o.page !== h.page && o.w.length > h.w.length && o.w.includes(h.w)));
  const named = [...new Set(kept.map((h) => h.page))];
  return named.length === 1 ? named[0] : null;
};
