import type { Actor } from '../domain/auth.ts';
import { MENU } from '../domain/menu.ts';
import type { MenuEvent, NewItem } from '../domain/menuEdits.ts';
import type { SectionSetting } from '../domain/sections.ts';
import type { Category, MenuItem } from '../domain/types.ts';

/*
 * Bata Kade's menu (possaas, 2026-11-16): ERP's counter, copied as it is, sells Bata Kade's food. The
 * menu goes in as ERP's own menu events (sections, items, the printed CheesyBeez items hidden), sent
 * by the shop server on the counter's first pull (server/firstMenu.ts). Names, Sinhala names and
 * prices from the shop's menu (possaas src/shop/bataKade.ts, 2026-10-30); items without a price left out.
 *
 * Rice & Curry has a morning price and a lunch & dinner price: two sections of the same name, each
 * sold at its own hours (section hours), so the counter shows one Rice & Curry whose prices change with
 * the time. Fried rice is sold only at night. The HOURS ARE PLACEHOLDERS until the owner gives them
 * (he changes them on the Menu screen). ERP has one kitchen: everything goes to it.
 */

/** Who added the menu: the POS itself, not a person (it shows in the audit as this). */
export const MENU_INSTALLER: Actor = { id: 'lume-pos', name: 'Lume POS', role: 'owner' };

const PORTIONS: SectionSetting['sizes'] = [{ id: 'x1', label: 'Normal' }, { id: 'x2', label: 'Full' }];

const at = (h: number) => h * 60;
const SECTIONS: { id: `sec-${string}`; setting: SectionSetting }[] = [
  { id: 'sec-rice-morning', setting: { name: { en: 'Rice & Curry', si: 'බත් සහ කරි' }, cookMinutes: 3, hours: { from: at(5), to: at(11) } } },
  { id: 'sec-rice', setting: { name: { en: 'Rice & Curry', si: 'බත් සහ කරි' }, cookMinutes: 3, hours: { from: at(11), to: at(5) } } },
  { id: 'sec-fried-rice', setting: { name: { en: 'Fried Rice', si: 'ෆ්‍රයිඩ් රයිස්' }, cookMinutes: 8, sizes: PORTIONS, hours: { from: at(18), to: at(5) } } },
  { id: 'sec-kottu', setting: { name: { en: 'Kottu', si: 'කොත්තු' }, cookMinutes: 8, sizes: PORTIONS } },
  { id: 'sec-meals', setting: { name: { en: 'Meals', si: 'ආහාර' }, cookMinutes: 3 } },
  { id: 'sec-other', setting: { name: { en: 'Other', si: 'වෙනත් ආහාර' }, cookMinutes: 2 } },
  { id: 'sec-roti', setting: { name: { en: 'String Hoppers, Roti & Rolls', si: 'ඉඳිආප්ප / රොටි / රෝල්ස්' }, cookMinutes: 2 } },
];

const rs = (n: number) => n * 100;
const one = (category: Category, id: string, en: string, si: string, price: number) =>
  ({ id: `new-${id}`, item: { category, name: { en, si }, description: '', prices: { one: rs(price) } } as NewItem });
const sized = (category: Category, id: string, en: string, si: string, normal: number, full: number) =>
  ({ id: `new-${id}`, item: { category, name: { en, si }, description: '', prices: { x1: rs(normal), x2: rs(full) } } as NewItem });

export const BATA_KADE_ITEMS: { id: string; item: NewItem }[] = [
  // Morning (5-11): the same names, the morning prices; chicken is a morning dish (no lunch price given).
  one('sec-rice-morning', 'rc-m-vege', 'Vegetable Rice & Curry', 'බත් එළවළු', 200),
  one('sec-rice-morning', 'rc-m-fish', 'Fish Rice & Curry', 'බත් මාළු', 250),
  one('sec-rice-morning', 'rc-m-egg', 'Egg Rice & Curry', 'බත් බිත්තර', 250),
  one('sec-rice-morning', 'rc-m-chicken', 'Chicken Rice & Curry', 'බත් චිකන්', 300),
  // Lunch and dinner (11 am - 5 am).
  one('sec-rice', 'rc-vege', 'Vegetable Rice & Curry', 'බත් එළවළු', 220),
  one('sec-rice', 'rc-fish', 'Fish Rice & Curry', 'බත් මාළු', 300),
  one('sec-rice', 'rc-egg', 'Egg Rice & Curry', 'බත් බිත්තර', 300),
  sized('sec-fried-rice', 'fr-chicken', 'Chicken Fried Rice', 'චිකන් ෆ්‍රයිඩ් රයිස්', 450, 750),
  sized('sec-fried-rice', 'fr-egg', 'Egg Fried Rice', 'බිත්තර ෆ්‍රයිඩ් රයිස්', 400, 650),
  sized('sec-kottu', 'kt-egg', 'Egg Kottu', 'බිත්තර කොත්තු', 450, 650),
  sized('sec-kottu', 'kt-chicken', 'Chicken Kottu', 'චිකන් කොත්තු', 500, 800),
  one('sec-meals', 'ml-bread-dhal', 'Bread ½ with Dhal', 'පාන් 1/2 පරිප්පු සමඟ', 150),
  one('sec-meals', 'ml-bread-potato', 'Bread ½ with Potato Curry', 'පාන් 1/2 අල හොදි සමඟ', 150),
  one('sec-meals', 'ml-bread-egg', 'Bread ½ with Egg', 'පාන් 1/2 බිත්තර සමඟ', 200),
  one('sec-meals', 'ml-milk-rice', 'Milk Rice (1 piece)', 'කිරිබත් කෑලි 01', 100),
  one('sec-meals', 'ml-pol-roti', 'Coconut Roti (1)', 'පොල් රොටි 01', 60),
  one('sec-meals', 'ml-noodles', 'Noodles', 'නූඩ්ල්ස්', 180),
  one('sec-meals', 'ml-string-hoppers', 'String Hoppers (10)', 'ඉඳි ආප්ප 10', 130),
  one('sec-other', 'ot-plain-tea', 'Plain Tea', 'ප්ලේන් ටී', 50),
  one('sec-other', 'ot-milk-tea', 'Milk Tea', 'කිරි තේ', 120),
  one('sec-other', 'ot-coffee', 'Coffee', 'කෝපි', 70),
  one('sec-other', 'ot-milk-coffee', 'Milk Coffee', 'කිරි කෝපි', 130),
  one('sec-other', 'ot-popsicle', 'Popsicle', 'පොප්සිකල්', 120),
  one('sec-other', 'ot-nestomalt', 'Nestomalt', 'පොස්ට්මෝල්ට්', 120),
  one('sec-other', 'ot-milo', 'Milo', 'මයිලෝ', 120),
  one('sec-other', 'ot-kahata', 'Plain Tea with Jaggery', 'කහට හකුරු සමඟ', 30),
  one('sec-other', 'ot-buns', 'Buns', 'ඊම් බනිස්', 100),
  one('sec-other', 'ot-muffin', 'Muffin', 'මෆින්', 150),
  one('sec-roti', 'rt-biriyani', 'Biriyani', 'බිරියානි', 500),
  one('sec-roti', 'rt-egg-roll', 'Egg Roll', 'බිත්තර රෝල්ස්', 130),
  one('sec-roti', 'rt-veg-roti', 'Vegetable Roti', 'එළවළු රොටි', 100),
  one('sec-roti', 'rt-egg-roti', 'Egg Roti', 'බිත්තර රොටි', 140),
  one('sec-roti', 'rt-wade', 'Parippu Wade', 'පරිප්පු වඩේ', 30),
];

/**
 * The menu as events, with fixed ids: the server keeps one event per id, so sending them again is a
 * no-op, and whatever the owner changes later (newer events) stays.
 */
export const bataKadeMenuEvents = (shopId: string, at: number, actor: Actor = MENU_INSTALLER): MenuEvent[] => {
  const base = { shopId, at, orderNumber: 0 as const, actor };
  return [
    ...SECTIONS.map(({ id, setting }): MenuEvent => ({ ...base, id: `bk-menu-${id}`, type: 'menu.section_set', itemId: id, before: null, after: setting })),
    ...BATA_KADE_ITEMS.map(({ id, item }): MenuEvent => ({ ...base, id: `bk-menu-${id}`, type: 'menu.item_added', itemId: id, item })),
    // CheesyBeez' printed pizzas, burgers and pastas: hidden (kept, so nothing old breaks).
    ...MENU.map((m): MenuEvent => ({ ...base, id: `bk-menu-hide-${m.id}`, type: 'menu.item_set', itemId: m.id, before: {}, after: { hidden: true } })),
    { ...base, id: 'bk-menu-order', type: 'menu.sections_ordered', itemId: 'sections', before: [], after: [...SECTIONS.map((s) => s.id), 'pizza', 'burger', 'pasta'] },
  ];
};

/** What staff type for each item ("egg rice", "kottu", "tea"), from possaas' menu: ERP's own items answer only to their full name. */
const ALIASES: Readonly<Record<string, string[]>> = {
  'new-rc-vege': ['vegetable rice', 'vege rice', 'veg rice', 'elawalu bath'],
  'new-rc-m-vege': ['vegetable rice', 'vege rice', 'veg rice', 'elawalu bath'],
  'new-rc-fish': ['fish rice', 'malu bath'],
  'new-rc-m-fish': ['fish rice', 'malu bath'],
  'new-rc-egg': ['egg rice', 'biththara bath'],
  'new-rc-m-chicken': ['chicken rice', 'chicken bath'],
  'new-rc-m-egg': ['egg rice', 'biththara bath'],
  'new-fr-chicken': ['chicken fried rice', 'chicken fried', 'fried rice'],
  'new-fr-egg': ['egg fried rice', 'egg fried'],
  'new-kt-egg': ['egg kottu'],
  'new-kt-chicken': ['chicken kottu', 'kottu'],
  'new-ml-bread-dhal': ['bread dhal', 'bread parippu', 'bread', 'paan'],
  'new-ml-bread-potato': ['bread potato', 'bread ala'],
  'new-ml-bread-egg': ['bread egg', 'bread biththara'],
  'new-ml-milk-rice': ['milk rice', 'kiribath', 'kiribat'],
  'new-ml-pol-roti': ['coconut roti', 'pol roti'],
  'new-ml-noodles': ['noodles', 'noodle'],
  'new-ml-string-hoppers': ['string hoppers', 'string hopper', 'idiyappam', 'indiappa'],
  'new-ot-plain-tea': ['plain tea', 'plaintea', 'tea'],
  'new-ot-milk-tea': ['milk tea', 'kiri the'],
  'new-ot-coffee': ['coffee', 'kopi'],
  'new-ot-milk-coffee': ['milk coffee', 'kiri kopi'],
  'new-ot-popsicle': ['popsicle'],
  'new-ot-nestomalt': ['nestomalt', 'postmalt', 'nesto'],
  'new-ot-milo': ['milo'],
  'new-ot-kahata': ['kahata', 'jaggery tea'],
  'new-ot-buns': ['buns', 'bun', 'banis'],
  'new-ot-muffin': ['muffin'],
  'new-rt-biriyani': ['biriyani', 'biryani'],
  'new-rt-egg-roll': ['egg roll', 'egg rolls'],
  'new-rt-veg-roti': ['vegetable roti', 'vege roti', 'veg roti'],
  'new-rt-egg-roti': ['egg roti'],
  'new-rt-wade': ['parippu wade', 'wade', 'vadai'],
};

/** The menu with Bata Kade's typing words added, for typed shorthand (ShorthandBar). */
export const withShopAliases = (items: readonly MenuItem[]): MenuItem[] =>
  items.map((m) => (ALIASES[m.id] ? { ...m, aliases: [...new Set([...m.aliases, ...ALIASES[m.id]])] } : m));
