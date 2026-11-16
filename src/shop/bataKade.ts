import type { Actor } from '../domain/auth.ts';
import { MENU } from '../domain/menu.ts';
import type { MenuEvent, NewItem } from '../domain/menuEdits.ts';
import type { SectionSetting } from '../domain/sections.ts';
import type { Category, MenuItem } from '../domain/types.ts';

/*
 * Bata Kade's menu (possaas, 2026-11-16): ERP's counter, copied as it is, sells Bata Kade's food. The
 * menu goes in as ERP's own menu events (sections, items, the printed CheesyBeez items hidden), sent
 * by the shop server on the counter's first pull (server/firstMenu.ts). Names, Sinhala names and
 * prices = possaas main's menu as it stands (price list 2026-11-13, changes 2026-11-14), copied by
 * running that code. ERP gives a section one set of sizes and no extras, so an item with its own
 * kinds is one card per kind ("Water (1 L)") and an extra is its own item ("Bread extra: Egg").
 *
 * Every item is sold all day except rice & curry, which has a breakfast price and a lunch & dinner
 * price: two sections of the same name, each sold at its own hours (section hours), so the counter shows
 * one Rice & Curry whose prices change with the time. The HOURS ARE PLACEHOLDERS until the owner gives them
 * (he changes them on the Menu screen). ERP has one kitchen: everything goes to it.
 */

/** Who added the menu: the POS itself, not a person (it shows in the audit as this). */
export const MENU_INSTALLER: Actor = { id: 'lume-pos', name: 'Lume POS', role: 'owner' };

const PORTIONS: SectionSetting['sizes'] = [{ id: 'x1', label: 'Half' }, { id: 'x2', label: 'Full' }];

const at = (h: number) => h * 60;
const SECTIONS: { id: `sec-${string}`; setting: SectionSetting }[] = [
  { id: 'sec-rice-morning', setting: { name: { en: 'Rice & Curry', si: 'බත් සහ කරි' }, cookMinutes: 3, hours: { from: at(5), to: at(11) } } },
  { id: 'sec-rice', setting: { name: { en: 'Rice & Curry', si: 'බත් සහ කරි' }, cookMinutes: 3, hours: { from: at(11), to: at(5) } } },
  { id: 'sec-fried-rice', setting: { name: { en: 'Fried Rice', si: 'ෆ්‍රයිඩ් රයිස්' }, cookMinutes: 8, sizes: PORTIONS } },
  { id: 'sec-kottu', setting: { name: { en: 'Kottu', si: 'කොත්තු' }, cookMinutes: 8, sizes: PORTIONS } },
  { id: 'sec-meals', setting: { name: { en: 'Meals', si: 'ආහාර' }, cookMinutes: 3 } },
  { id: 'sec-drinks', setting: { name: { en: 'Drinks', si: 'බීම' }, cookMinutes: 1 } },
  { id: 'sec-other', setting: { name: { en: 'Other', si: 'වෙනත් ආහාර' }, cookMinutes: 2 } },
];

const rs = (n: number) => n * 100;
const one = (category: Category, id: string, en: string, si: string, price: number) =>
  ({ id: `new-${id}`, item: { category, name: { en, si }, description: '', prices: { one: rs(price) } } as NewItem });
const sized = (category: Category, id: string, en: string, si: string, normal: number, full: number) =>
  ({ id: `new-${id}`, item: { category, name: { en, si }, description: '', prices: { x1: rs(normal), x2: rs(full) } } as NewItem });

export const BATA_KADE_ITEMS: { id: string; item: NewItem }[] = [
  one('sec-rice-morning', 'rc-m-vege', 'Vegetable Rice & Curry', 'බත් එළවළු', 200),
  one('sec-rice-morning', 'rc-m-fish', 'Fish Rice & Curry', 'බත් මාළු', 250),
  one('sec-rice-morning', 'rc-m-egg', 'Egg Rice & Curry', 'බත් බිත්තර', 230),
  one('sec-rice-morning', 'rc-m-chicken', 'Chicken Rice & Curry', 'බත් චිකන්', 300),
  one('sec-rice-morning', 'rc-m-special', 'Special Rice', 'ස්පෙෂල් රයිස්', 330),
  one('sec-rice', 'rc-d-vege', 'Vegetable Rice & Curry', 'බත් එළවළු', 220),
  one('sec-rice', 'rc-d-fish', 'Fish Rice & Curry', 'බත් මාළු', 300),
  one('sec-rice', 'rc-d-egg', 'Egg Rice & Curry', 'බත් බිත්තර', 280),
  one('sec-rice', 'rc-d-chicken', 'Chicken Rice & Curry', 'බත් චිකන්', 350),
  one('sec-rice', 'rc-d-special', 'Special Rice', 'ස්පෙෂල් රයිස්', 330),
  sized('sec-fried-rice', 'fr-chicken', 'Chicken Fried Rice', 'චිකන් ෆ්‍රයිඩ් රයිස්', 450, 750),
  sized('sec-fried-rice', 'fr-egg', 'Egg Fried Rice', 'බිත්තර ෆ්‍රයිඩ් රයිස්', 400, 650),
  sized('sec-fried-rice', 'fr-mixed', 'Mixed Fried Rice', 'මික්ස් ෆ්‍රයිඩ් රයිස්', 600, 1200),
  sized('sec-kottu', 'kt-egg', 'Egg Kottu', 'බිත්තර කොත්තු', 450, 650),
  sized('sec-kottu', 'kt-chicken', 'Chicken Kottu', 'චිකන් කොත්තු', 500, 750),
  one('sec-meals', 'ml-biriyani', 'Biriyani', 'බිරියානි', 330),
  one('sec-meals', 'ml-milk-rice', 'Milk Rice (1 piece)', 'කිරිබත් කෑලි 01', 100),
  one('sec-meals', 'ml-pol-roti', 'Coconut Roti (1)', 'පොල් රොටි 01', 60),
  one('sec-meals', 'ml-green-gram', 'Green Gram', 'මුං ඇට', 150),
  one('sec-meals', 'ml-chickpeas', 'Chickpeas', 'කඩල', 150),
  one('sec-meals', 'ml-noodles', 'Noodles', 'නූඩ්ල්ස්', 160),
  one('sec-meals', 'br-bread-dhal', 'Bread (Dhal)', 'පාන් (Dhal)', 150),
  one('sec-meals', 'br-bread-potato', 'Bread (Potato)', 'පාන් (Potato)', 150),
  one('sec-meals', 'br-bread-add-egg', 'Bread extra: Egg', '', 50),
  one('sec-meals', 'br-bread-add-fish', 'Bread extra: Fish', '', 100),
  one('sec-meals', 'br-bread-add-chicken', 'Bread extra: Chicken', '', 120),
  one('sec-meals', 'sh-string-hoppers-10', 'String Hoppers (10)', 'ඉඳි ආප්ප (10)', 120),
  one('sec-meals', 'sh-string-hoppers-15', 'String Hoppers (15)', 'ඉඳි ආප්ප (15)', 160),
  one('sec-meals', 'sh-string-hoppers-20', 'String Hoppers (20)', 'ඉඳි ආප්ප (20)', 200),
  one('sec-meals', 'sh-string-hoppers-add-5-more', 'String Hoppers: 5 more', '', 40),
  one('sec-meals', 'sh-string-hoppers-add-10-more', 'String Hoppers: 10 more', '', 80),
  one('sec-meals', 'rt-egg-roll-egg', 'Roll (Egg)', 'රෝල්ස් (Egg)', 100),
  one('sec-meals', 'rt-egg-roll-fish', 'Roll (Fish)', 'රෝල්ස් (Fish)', 100),
  one('sec-meals', 'rt-veg-roti', 'Vegetable Roti', 'එළවළු රොටි', 80),
  one('sec-meals', 'rt-egg-roti-plain', 'Egg Roti (Plain)', 'බිත්තර රොටි (Plain)', 100),
  one('sec-meals', 'rt-egg-roti-gravy', 'Egg Roti (Gravy)', 'බිත්තර රොටි (Gravy)', 120),
  one('sec-meals', 'rt-paratha', 'Paratha with Gravy', 'පරාට හොදි', 60),
  one('sec-meals', 'rt-wade', 'Parippu Wade', 'පරිප්පු වඩේ', 30),
  one('sec-meals', 'rt-ulundu-wade-plain', 'Ulundu Wade (Plain)', 'උළුඳු වඩේ (Plain)', 60),
  one('sec-meals', 'rt-ulundu-wade-gravy', 'Ulundu Wade (Gravy)', 'උළුඳු වඩේ (Gravy)', 70),
  one('sec-drinks', 'ot-plain-tea', 'Plain Tea', 'ප්ලේන් ටී', 50),
  one('sec-drinks', 'ot-milk-tea', 'Milk Tea', 'කිරි තේ', 120),
  one('sec-drinks', 'ot-coffee', 'Coffee', 'කෝපි', 70),
  one('sec-drinks', 'ot-milk-coffee', 'Milk Coffee', 'කිරි කෝපි', 130),
  one('sec-drinks', 'ot-nestomalt', 'Nestomalt', 'පොස්ට්මෝල්ට්', 120),
  one('sec-drinks', 'ot-milo', 'Milo', 'මයිලෝ', 120),
  one('sec-drinks', 'dr-drink-buddy', 'Drink (Buddy)', 'බීම (Buddy)', 100),
  one('sec-drinks', 'dr-drink-medium', 'Drink (Medium)', 'බීම (Medium)', 180),
  one('sec-drinks', 'dr-water-500ml', 'Water (500 ml)', 'වතුර (500 ml)', 80),
  one('sec-drinks', 'dr-water-1l', 'Water (1 L)', 'වතුර (1 L)', 120),
  one('sec-drinks', 'dr-water-1-5l', 'Water (1.5 L)', 'වතුර (1.5 L)', 150),
  one('sec-drinks', 'dr-sun-crush', 'Sun Crush', 'සන් ක්‍රෂ්', 150),
  one('sec-drinks', 'dr-faluda', 'Faluda / Rose Drink', 'ෆලූඩා / රෝස් බීම', 100),
  one('sec-drinks', 'dr-pepsi-400ml', 'Pepsi (400 ml)', 'පෙප්සි (400 ml)', 200),
  one('sec-drinks', 'dr-pepsi-1l', 'Pepsi (1 L)', 'පෙප්සි (1 L)', 300),
  one('sec-drinks', 'dr-pepsi-1-5l', 'Pepsi (1.5 L)', 'පෙප්සි (1.5 L)', 420),
  one('sec-drinks', 'dr-coke-400ml', 'Coca-Cola (400 ml)', 'කොකා කෝලා (400 ml)', 200),
  one('sec-drinks', 'dr-coke-1l', 'Coca-Cola (1 L)', 'කොකා කෝලා (1 L)', 300),
  one('sec-drinks', 'dr-coke-1-5l', 'Coca-Cola (1.5 L)', 'කොකා කෝලා (1.5 L)', 420),
  one('sec-drinks', 'dr-sprite-400', 'Sprite (400 ml)', 'ස්ප්‍රයිට් 400 ml', 200),
  one('sec-drinks', 'dr-mirinda-400', 'Mirinda (400 ml)', 'මිරින්ඩා 400 ml', 200),
  one('sec-drinks', 'dr-7up-400', '7UP (400 ml)', 'සෙවන් අප් 400 ml', 200),
  one('sec-drinks', 'dr-egb-1000', 'EGB (1 L)', 'ඊ.ජී.බී. ලීටර් 1', 300),
  one('sec-drinks', 'dr-soda-1500', 'Cream Soda / Ginger Beer (1.5 L)', 'ක්‍රීම් සෝඩා / ජින්ජර් බියර් ලීටර් 1.5', 420),
  one('sec-other', 'ot-popsicle', 'Popsicle', 'පොප්සිකල්', 120),
  one('sec-other', 'ot-buns', 'Buns', 'ඊම් බනිස්', 100),
  one('sec-other', 'ot-muffin', 'Muffin', 'මෆින්', 150),
  one('sec-other', 'ot-yoghurt', 'Yoghurt', 'යෝගට්', 80),
  one('sec-other', 'ot-jelly', 'Jelly', 'ජෙලි', 80),
  one('sec-other', 'ot-watalappan', 'Watalappan', 'වටලප්පන්', 120),
  one('sec-other', 'ot-campa', 'Campa / N.K.G.', 'කැම්පා / එන්.කේ.ජී.', 250),
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
  'new-rc-m-vege': ['vegetable rice', 'vege rice', 'veg rice', 'elawalu bath'],
  'new-rc-m-fish': ['fish rice', 'malu bath'],
  'new-rc-m-egg': ['egg rice', 'biththara bath'],
  'new-rc-m-chicken': ['chicken rice', 'chicken bath'],
  'new-rc-m-special': ['special rice', 'special'],
  'new-rc-d-vege': ['vegetable rice', 'vege rice', 'veg rice', 'elawalu bath'],
  'new-rc-d-fish': ['fish rice', 'malu bath'],
  'new-rc-d-egg': ['egg rice', 'biththara bath'],
  'new-rc-d-chicken': ['chicken rice', 'chicken bath'],
  'new-rc-d-special': ['special rice', 'special'],
  'new-fr-chicken': ['chicken fried rice', 'chicken fried', 'fried rice'],
  'new-fr-egg': ['egg fried rice', 'egg fried'],
  'new-fr-mixed': ['mixed fried rice', 'mix fried rice', 'mixed fried'],
  'new-kt-egg': ['egg kottu'],
  'new-kt-chicken': ['chicken kottu', 'kottu'],
  'new-ml-biriyani': ['biriyani', 'biryani', 'buriyani'],
  'new-ml-milk-rice': ['milk rice', 'kiribath', 'kiribat'],
  'new-ml-pol-roti': ['coconut roti', 'pol roti'],
  'new-ml-green-gram': ['green gram', 'mung', 'mun ata'],
  'new-ml-chickpeas': ['chickpeas', 'kadala'],
  'new-ml-noodles': ['noodles', 'noodle'],
  'new-br-bread-dhal': ['bread', 'paan', 'bread gravy', 'bread dhal', 'bread parippu', 'dhal bread'],
  'new-br-bread-potato': ['bread potato', 'bread ala', 'potato bread'],
  'new-br-bread-add-egg': ['bread egg'],
  'new-br-bread-add-fish': ['bread fish'],
  'new-br-bread-add-chicken': ['bread chicken'],
  'new-sh-string-hoppers-10': ['string hoppers', 'string hopper', 'idiyappam', 'indiappa', 'string hoppers 10', '10 string hoppers'],
  'new-sh-string-hoppers-15': ['string hoppers 15', '15 string hoppers'],
  'new-sh-string-hoppers-20': ['string hoppers 20', '20 string hoppers'],
  'new-sh-string-hoppers-add-5-more': ['string hoppers 5 more'],
  'new-sh-string-hoppers-add-10-more': ['string hoppers 10 more'],
  'new-rt-egg-roll-egg': ['roll', 'rolls', 'egg roll', 'egg rolls', 'roll egg'],
  'new-rt-egg-roll-fish': ['fish roll', 'fish rolls', 'roll fish'],
  'new-rt-veg-roti': ['vegetable roti', 'vege roti', 'veg roti'],
  'new-rt-egg-roti-plain': ['egg roti', 'egg roti plain', 'plain egg roti'],
  'new-rt-egg-roti-gravy': ['egg roti gravy', 'gravy egg roti'],
  'new-rt-paratha': ['paratha', 'parata'],
  'new-rt-wade': ['parippu wade', 'dhal wade', 'wade', 'vadai'],
  'new-rt-ulundu-wade-plain': ['ulundu wade', 'ulundu', 'ulundu wade plain', 'plain ulundu wade'],
  'new-rt-ulundu-wade-gravy': ['ulundu wade gravy', 'ulundu gravy', 'gravy ulundu wade'],
  'new-ot-plain-tea': ['plain tea', 'plaintea', 'tea'],
  'new-ot-milk-tea': ['milk tea', 'kiri the'],
  'new-ot-coffee': ['coffee', 'kopi'],
  'new-ot-milk-coffee': ['milk coffee', 'kiri kopi'],
  'new-ot-nestomalt': ['nestomalt', 'postmalt', 'nesto'],
  'new-ot-milo': ['milo'],
  'new-dr-drink-buddy': ['drink', 'buddy', 'small drink', 'drink buddy', 'buddy drink'],
  'new-dr-drink-medium': ['medium', 'medium drink', 'drink medium'],
  'new-dr-water-500ml': ['water', 'water 500 ml', '500 ml water'],
  'new-dr-water-1l': ['water 1 l', '1 l water'],
  'new-dr-water-1-5l': ['big water', 'water 1.5 l', '1.5 l water'],
  'new-dr-sun-crush': ['sun crush', 'suncrush'],
  'new-dr-faluda': ['faluda', 'rose drink'],
  'new-dr-pepsi-400ml': ['pepsi', 'pepsi 400 ml', '400 ml pepsi'],
  'new-dr-pepsi-1l': ['pepsi 1 l', '1 l pepsi'],
  'new-dr-pepsi-1-5l': ['big pepsi', 'pepsi 1.5 l', '1.5 l pepsi'],
  'new-dr-coke-400ml': ['coke', 'coca cola', 'coke 400 ml', '400 ml coke'],
  'new-dr-coke-1l': ['coke 1 l', '1 l coke'],
  'new-dr-coke-1-5l': ['big coke', 'coke 1.5 l', '1.5 l coke'],
  'new-dr-sprite-400': ['sprite'],
  'new-dr-mirinda-400': ['mirinda'],
  'new-dr-7up-400': ['7up', 'seven up'],
  'new-dr-egb-1000': ['egb', 'ginger beer 1l'],
  'new-dr-soda-1500': ['cream soda', 'ginger beer'],
  'new-ot-popsicle': ['popsicle'],
  'new-ot-buns': ['buns', 'bun', 'banis'],
  'new-ot-muffin': ['muffin'],
  'new-ot-yoghurt': ['yoghurt', 'yogurt', 'curd'],
  'new-ot-jelly': ['jelly'],
  'new-ot-watalappan': ['watalappan', 'watalappam'],
  'new-ot-campa': ['campa', 'nkg'],
};

/** The menu with Bata Kade's typing words added, for typed shorthand (ShorthandBar). */
export const withShopAliases = (items: readonly MenuItem[]): MenuItem[] =>
  items.map((m) => (ALIASES[m.id] ? { ...m, aliases: [...new Set([...m.aliases, ...ALIASES[m.id]])] } : m));
