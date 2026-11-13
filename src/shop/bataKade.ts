import type { StartingMenu } from '../domain/menuEdits.ts';
import type { MenuUpdate } from '../domain/menuUpdate.ts';
import type { MenuItem, Section } from '../domain/types.ts';

/*
 * possaas is Bata Kade's POS (2026-10-30): this is the shop's real menu. A new Bata Kade shop server
 * adds it once, the first time its counter connects with no menu yet (server/firstMenu.ts); the
 * rice demo (/?demo=rice) shows it too. Change it here only from the owner's own menu, and list every
 * change to an item a shop already has in BATA_KADE_UPDATES below, or running shops keep the old one.
 */

/**
 * Bata Kade's own menu, its prices and Sinhala names copied from the shop's menu (given by the
 * developer 2026-10-30, new price list from the shop 2026-11-13). Sinhala names only where the shop
 * wrote one; never translated here. "Fish / Egg" lines are one item each so the kitchen knows which.
 *
 * Every item is on sale all day (developer, 2026-11-13); only rice & curry's price changes with the
 * time: a breakfast price and a lunch & dinner price, two sections of the same name, each sold at its
 * own hours, so the counter always shows one Rice & Curry. The HOURS ARE PLACEHOLDERS until the owner
 * gives them.
 */
const PORTIONS = [{ id: 'normal', label: 'Normal' }, { id: 'full', label: 'Full' }];
/** Fried rice, biriyani and kottu: the shop calls the small one Half. Same size id, so old orders stay. */
const HALF_FULL = [{ id: 'normal', label: 'Half' }, { id: 'full', label: 'Full' }];
const BREAKFAST = { from: 5 * 60, to: 11 * 60 };
const LUNCH_AND_DINNER = { from: 11 * 60, to: 5 * 60 };
// Two kitchens (asked for by the developer, 2026-10-29): rice and the rest on the left, kottu and fried rice on the right.
const RICE_MORNING_SECTION: Section = { id: 'rice-morning', name: 'Rice & Curry · බත් සහ කරි', cookMinutes: 3, sizes: PORTIONS, adds: [], station: 'left', hours: BREAKFAST };
const RICE_DAY_SECTION: Section = { id: 'rice-day', name: 'Rice & Curry · බත් සහ කරි', cookMinutes: 3, sizes: PORTIONS, adds: [], station: 'left', hours: LUNCH_AND_DINNER };
const FRIED_RICE_SECTION: Section = { id: 'fried-rice', name: 'Fried Rice · ෆ්‍රයිඩ් රයිස්', cookMinutes: 8, sizes: HALF_FULL, adds: [], station: 'right' };
const MEALS_SECTION: Section = { id: 'meals', name: 'Meals · ආහාර', cookMinutes: 3, sizes: [], adds: [], station: 'left' };
const KOTTU_SECTION: Section = { id: 'kottu', name: 'Kottu · කොත්තු', cookMinutes: 8, sizes: HALF_FULL, adds: [], station: 'right' };
const OTHER_SECTION: Section = { id: 'other', name: 'Other · වෙනත් ආහාර', cookMinutes: 2, sizes: [], adds: [], station: 'left' };
const ROTI_SECTION: Section = { id: 'roti', name: 'String Hoppers, Roti & Rolls · ඉඳිආප්ප / රොටි / රෝල්ස්', cookMinutes: 2, sizes: [], adds: [], station: 'left' };
const DRINKS_SECTION: Section = { id: 'drinks', name: 'Drinks · බීම', cookMinutes: 1, sizes: [], adds: [], station: 'left' };
const names = (en: string, si: string) => (si ? { en, si } : { en });
/** Prices by size, in rupees; a size without a price is not offered. */
const sized = (category: string, id: string, name: string, si: string, aliases: string[], prices: Record<string, number>, sizes = PORTIONS): MenuItem => ({
  id, category, name: names(name, si), description: '', aliases,
  variants: sizes.flatMap((z) => (prices[z.id] ? [{ ...z, price: prices[z.id] * 100 }] : [])), adds: [], leaveOut: [],
});
const halfFull = (category: string, id: string, name: string, si: string, aliases: string[], half: number, full: number): MenuItem =>
  sized(category, id, name, si, aliases, { normal: half, full }, HALF_FULL);
const one = (category: string, id: string, name: string, si: string, aliases: string[], price: number): MenuItem => ({
  id, category, name: names(name, si), description: '', aliases, price: price * 100, adds: [], leaveOut: [],
});
export const BATA_KADE_MENU: StartingMenu = {
  sections: [RICE_MORNING_SECTION, RICE_DAY_SECTION, FRIED_RICE_SECTION, KOTTU_SECTION, MEALS_SECTION, OTHER_SECTION, ROTI_SECTION, DRINKS_SECTION],
  items: [
    // The same names and aliases at breakfast and later: only one of the two is sold at a time.
    sized('rice-morning', 'rc-m-vege', 'Vegetable Rice & Curry', 'බත් එළවළු', ['vegetable rice', 'vege rice', 'veg rice', 'elawalu bath'], { normal: 200 }),
    sized('rice-morning', 'rc-m-fish', 'Fish Rice & Curry', 'බත් මාළු', ['fish rice', 'malu bath'], { normal: 250 }),
    sized('rice-morning', 'rc-m-egg', 'Egg Rice & Curry', 'බත් බිත්තර', ['egg rice', 'biththara bath'], { normal: 230 }),
    sized('rice-morning', 'rc-m-chicken', 'Chicken Rice & Curry', 'බත් චිකන්', ['chicken rice', 'chicken bath'], { normal: 300 }),
    // The shop gave Special Rice a lunch price only; it sells at that price all day.
    sized('rice-morning', 'rc-m-special', 'Special Rice', 'ස්පෙෂල් රයිස්', ['special rice', 'special'], { normal: 330 }),
    sized('rice-day', 'rc-d-vege', 'Vegetable Rice & Curry', 'බත් එළවළු', ['vegetable rice', 'vege rice', 'veg rice', 'elawalu bath'], { normal: 220 }),
    sized('rice-day', 'rc-d-fish', 'Fish Rice & Curry', 'බත් මාළු', ['fish rice', 'malu bath'], { normal: 300 }),
    sized('rice-day', 'rc-d-egg', 'Egg Rice & Curry', 'බත් බිත්තර', ['egg rice', 'biththara bath'], { normal: 280 }),
    sized('rice-day', 'rc-d-chicken', 'Chicken Rice & Curry', 'බත් චිකන්', ['chicken rice', 'chicken bath'], { normal: 350 }),
    sized('rice-day', 'rc-d-special', 'Special Rice', 'ස්පෙෂල් රයිස්', ['special rice', 'special'], { normal: 330 }),
    halfFull('fried-rice', 'fr-chicken', 'Chicken Fried Rice', 'චිකන් ෆ්‍රයිඩ් රයිස්', ['chicken fried rice', 'chicken fried', 'fried rice'], 450, 750),
    halfFull('fried-rice', 'fr-egg', 'Egg Fried Rice', 'බිත්තර ෆ්‍රයිඩ් රයිස්', ['egg fried rice', 'egg fried'], 400, 650),
    halfFull('fried-rice', 'fr-mixed', 'Mixed Fried Rice', 'මික්ස් ෆ්‍රයිඩ් රයිස්', ['mixed fried rice', 'mix fried rice', 'mixed fried'], 600, 1200),
    halfFull('fried-rice', 'fr-biriyani-chicken', 'Chicken Biriyani', 'චිකන් බිරියානි', ['chicken biriyani', 'chicken biryani', 'biriyani', 'biryani'], 450, 750),
    halfFull('fried-rice', 'fr-biriyani-egg', 'Egg Biriyani', 'බිත්තර බිරියානි', ['egg biriyani', 'egg biryani'], 400, 650),
    halfFull('fried-rice', 'fr-biriyani-mixed', 'Mixed Biriyani', 'මික්ස් බිරියානි', ['mixed biriyani', 'mix biriyani', 'mixed biryani'], 600, 1200),
    halfFull('kottu', 'kt-egg', 'Egg Kottu', 'බිත්තර කොත්තු', ['egg kottu'], 450, 650),
    halfFull('kottu', 'kt-chicken', 'Chicken Kottu', 'චිකන් කොත්තු', ['chicken kottu', 'kottu'], 500, 800),
    one('meals', 'ml-bread-dhal', 'Bread with Dhal', 'පාන් පරිප්පු සමඟ', ['bread dhal', 'bread parippu', 'bread', 'paan', 'bread gravy'], 150),
    one('meals', 'ml-bread-potato', 'Bread with Potato Curry', 'පාන් අල හොදි සමඟ', ['bread potato', 'bread ala'], 150),
    one('meals', 'ml-bread-egg', 'Bread with Gravy & Egg', 'පාන් හොදි බිත්තර', ['bread egg', 'bread biththara'], 200),
    one('meals', 'ml-bread-fish', 'Bread with Fish', '', ['bread fish', 'bread malu'], 250),
    one('meals', 'ml-bread-chicken', 'Bread with Chicken', '', ['bread chicken'], 270),
    one('meals', 'ml-milk-rice', 'Milk Rice (1 piece)', 'කිරිබත් කෑලි 01', ['milk rice', 'kiribath', 'kiribat'], 100),
    one('meals', 'ml-pol-roti', 'Coconut Roti (1)', 'පොල් රොටි 01', ['coconut roti', 'pol roti'], 60),
    one('meals', 'ml-green-gram', 'Green Gram', 'මුං ඇට', ['green gram', 'mung', 'mun ata'], 150),
    one('meals', 'ml-chickpeas', 'Chickpeas', 'කඩල', ['chickpeas', 'kadala'], 150),
    one('meals', 'ml-noodles', 'Noodles', 'නූඩ්ල්ස්', ['noodles', 'noodle'], 160),
    one('meals', 'ml-string-hoppers', 'String Hoppers (10)', 'ඉඳි ආප්ප 10', ['string hoppers', 'string hopper', 'idiyappam', 'indiappa'], 120),
    one('meals', 'ml-string-hoppers-15', 'String Hoppers (15)', 'ඉඳි ආප්ප 15', ['string hoppers 15', 'indiappa 15'], 160),
    one('meals', 'ml-string-hoppers-20', 'String Hoppers (20)', 'ඉඳි ආප්ප 20', ['string hoppers 20', 'indiappa 20'], 200),
    one('other', 'ot-plain-tea', 'Plain Tea', 'ප්ලේන් ටී', ['plain tea', 'plaintea', 'tea'], 50),
    one('other', 'ot-milk-tea', 'Milk Tea', 'කිරි තේ', ['milk tea', 'kiri the'], 120),
    one('other', 'ot-coffee', 'Coffee', 'කෝපි', ['coffee', 'kopi'], 70),
    one('other', 'ot-milk-coffee', 'Milk Coffee', 'කිරි කෝපි', ['milk coffee', 'kiri kopi'], 130),
    one('other', 'ot-popsicle', 'Popsicle', 'පොප්සිකල්', ['popsicle'], 120),
    one('other', 'ot-nestomalt', 'Nestomalt', 'පොස්ට්මෝල්ට්', ['nestomalt', 'postmalt', 'nesto'], 120),
    one('other', 'ot-milo', 'Milo', 'මයිලෝ', ['milo'], 120),
    one('other', 'ot-kahata', 'Plain Tea with Jaggery', 'කහට හකුරු සමඟ', ['kahata', 'jaggery tea'], 30),
    one('other', 'ot-buns', 'Buns', 'ඊම් බනිස්', ['buns', 'bun', 'banis'], 100),
    one('other', 'ot-muffin', 'Muffin', 'මෆින්', ['muffin'], 150),
    one('other', 'ot-yoghurt', 'Yoghurt', '', ['yoghurt', 'yogurt', 'curd'], 80),
    one('other', 'ot-jelly', 'Jelly', '', ['jelly'], 80),
    one('other', 'ot-watalappan', 'Watalappan', '', ['watalappan', 'watalappam'], 120),
    // As the shop wrote it; what it is is still to be asked (150 was crossed out for 250).
    one('other', 'ot-campa', 'Campa / N.K.G.', '', ['campa', 'nkg'], 250),
    one('roti', 'rt-egg-roll', 'Egg Roll', 'බිත්තර රෝල්ස්', ['egg roll', 'egg rolls'], 100),
    one('roti', 'rt-fish-roll', 'Fish Roll', '', ['fish roll', 'fish rolls'], 100),
    one('roti', 'rt-veg-roti', 'Vegetable Roti', 'එළවළු රොටි', ['vegetable roti', 'vege roti', 'veg roti'], 80),
    one('roti', 'rt-egg-roti', 'Egg Roti', 'බිත්තර රොටි', ['egg roti'], 100),
    one('roti', 'rt-egg-roti-gravy', 'Egg Roti with Gravy', 'බිත්තර රොටි හොදි සමඟ', ['egg roti gravy'], 120),
    one('roti', 'rt-paratha', 'Paratha with Gravy', 'පරාට හොදි', ['paratha', 'parata'], 60),
    one('roti', 'rt-wade', 'Parippu Wade', 'පරිප්පු වඩේ', ['parippu wade', 'dhal wade', 'wade', 'vadai'], 30),
    one('roti', 'rt-ulundu-wade', 'Ulundu Wade', 'උළුඳු වඩේ', ['ulundu wade', 'ulundu'], 60),
    one('roti', 'rt-ulundu-wade-gravy', 'Ulundu Wade with Gravy', 'උළුඳු වඩේ හොදි සමඟ', ['ulundu wade gravy', 'ulundu gravy'], 70),
    one('drinks', 'dr-water-500', 'Water (500 ml)', '', ['water', 'water 500'], 80),
    one('drinks', 'dr-water-1000', 'Water (1 L)', '', ['water 1l', 'water 1 l', 'big water'], 120),
    one('drinks', 'dr-water-1500', 'Water (1.5 L)', '', ['water 1.5', 'water 1.5l'], 150),
    one('drinks', 'dr-sun-crush', 'Sun Crush', '', ['sun crush', 'suncrush'], 150),
    one('drinks', 'dr-faluda', 'Faluda / Rose Drink', '', ['faluda', 'rose drink'], 100),
    one('drinks', 'dr-beer', 'Beer / Malt Drink', 'බියර්', ['beer', 'malt'], 180),
    one('drinks', 'dr-pepsi-400', 'Pepsi (400 ml)', '', ['pepsi'], 200),
    one('drinks', 'dr-coke-400', 'Coca-Cola (400 ml)', '', ['coke', 'coca cola'], 200),
    one('drinks', 'dr-sprite-400', 'Sprite (400 ml)', '', ['sprite'], 200),
    one('drinks', 'dr-mirinda-400', 'Mirinda (400 ml)', '', ['mirinda'], 200),
    one('drinks', 'dr-7up-400', '7UP (400 ml)', '', ['7up', 'seven up'], 200),
    one('drinks', 'dr-pepsi-1000', 'Pepsi (1 L)', '', ['pepsi 1l', 'big pepsi'], 300),
    one('drinks', 'dr-coke-1000', 'Coca-Cola (1 L)', '', ['coke 1l', 'big coke'], 300),
    one('drinks', 'dr-egb-1000', 'EGB (1 L)', '', ['egb', 'ginger beer 1l'], 300),
    one('drinks', 'dr-soda-1500', 'Cream Soda / Ginger Beer (1.5 L)', '', ['cream soda', 'ginger beer'], 420),
    one('drinks', 'dr-cola-1500', 'Coca-Cola / Pepsi (1.5 L)', '', ['coke 1.5', 'pepsi 1.5'], 420),
  ],
};

/**
 * Changes to what a running shop already has (new items reach it by themselves: they have new ids).
 * Each update is sent once, by Lume POS, after the menu (src/domain/menuUpdate.ts); its prices, names
 * and sections come from BATA_KADE_MENU above. Never edit an update once released: add a new one.
 */
export const BATA_KADE_UPDATES: MenuUpdate[] = [
  {
    // The shop's new price list (2026-11-13): new prices, Half / Full, fried rice all day, biriyani by kind.
    id: '2026-11-13',
    sections: ['fried-rice', 'kottu'],
    prices: ['rc-m-egg', 'rc-d-egg', 'ml-noodles', 'ml-string-hoppers', 'rt-egg-roti', 'rt-veg-roti', 'rt-egg-roll'],
    names: ['ml-bread-dhal', 'ml-bread-potato', 'ml-bread-egg'],
    removed: ['rt-biriyani'],
  },
];
