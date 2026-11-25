/**
 * Bata Kade's dishes' photos until the shop takes its own (2026-11-25): src/shop/photos/<food>.jpg,
 * 240 x 240, shown in the Register cards' photo square. A photo the owner sets on the Menu screen
 * replaces one of these; "no photo" hides it. Dishes of the same food share a picture (both Rice &
 * Curry sections, the three waters).
 *
 * Free stock photos, no attribution needed: Unsplash (unsplash.com/photos/<id>, as
 * images.unsplash.com/photo-<id>) and Pixabay (pixabay.com, the number at the end of the file name).
 * Unsplash: rice-fish 1761314036779-84078bec535c ·
 * rice-egg 1777312820610-8d5321fd45ad · rice-special 1791012833696-f167d14d6cdf ·
 * fried-rice-chicken 1603133872878-684f208fb84b · fried-rice-egg 1512058564366-18510be2db19 ·
 * fried-rice-mixed 1672856399675-8c099efbe0e2 · biriyani 1631515243349-e0cb75fb8d3a ·
 * green-gram 1788629531508-c0d971473c37 · noodles 1585032226651-759b368d7246 ·
 * bread-dhal 1606491956689-2ea866880c84 · bread-potato 1708782344137-21c48d98dfcc ·
 * egg-curry 1764315197254-94385571df22 · chicken-curry 1708782344490-9026aaa5eec7 ·
 * roll 1787273670681-b1886c2807a3 · paratha 1708783741187-ff1d081d87da · ulundu-wade 1730191843435-073792ba22bc ·
 * plain-tea 1546641555-20676239fb5d · milk-tea 1595434091143-b375ced5fe5c · coffee 1514432324607-a09d9b4aefdd ·
 * milk-coffee 1577590835286-1cdd24c08fd7 · malt-drink 1517578239113-b03992dcdd25 ·
 * soft-drink 1605712916345-6ef6bcc2e29c · water 1616118132534-381148898bb4 · orange-drink 1600271886742-f049cd451bba ·
 * faluda 1630823184409-1c6014968038 · pepsi 1629203849820-fdd70d49c38e · coca-cola 1567103472667-6898f3a79cf2 ·
 * sprite 1690988109041-458628590a9e · mirinda 1566846128021-b940b0eec910 · 7up 1624517286326-62fc932dffca ·
 * ginger-beer 1576153880408-4ac632dc83b2 · popsicle 1528826058331-d59e395cfe43 · buns 1632552544552-3ca612a328ac ·
 * muffin 1637861004744-0f846ef2df40 · yoghurt 1571230389215-b34a89739ef1 · jelly 1597396979329-42c7aeca23ba ·
 * watalappan 1702728109878-c61a98d80491 (a caramel pudding, the nearest there was).
 * Pixabay: rice-vegetable 6324799 · rice-chicken 6303122 · kottu-egg 6319360 · kottu-chicken 6319357 ·
 * milk-rice 6314070 · pol-roti 6303133 · chickpeas 6322037 · string-hoppers 6308472 · roti 6324791 ·
 * parippu-wade 6305690.
 */
const files = import.meta.glob<string>('./photos/*.jpg', { eager: true, query: '?url', import: 'default' });
const byName: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice('./photos/'.length, -'.jpg'.length), url]));

/** Each dish's food, by its menu id (bataKade.ts). */
const FOOD: Readonly<Record<string, string>> = {
  'new-rc-m-vege': 'rice-vegetable', 'new-rc-d-vege': 'rice-vegetable',
  'new-rc-m-fish': 'rice-fish', 'new-rc-d-fish': 'rice-fish',
  'new-rc-m-egg': 'rice-egg', 'new-rc-d-egg': 'rice-egg',
  'new-rc-m-chicken': 'rice-chicken', 'new-rc-d-chicken': 'rice-chicken',
  'new-rc-m-special': 'rice-special', 'new-rc-d-special': 'rice-special',
  'new-fr-chicken': 'fried-rice-chicken', 'new-fr-egg': 'fried-rice-egg', 'new-fr-mixed': 'fried-rice-mixed',
  'new-kt-egg': 'kottu-egg', 'new-kt-chicken': 'kottu-chicken',
  'new-ml-biriyani': 'biriyani', 'new-ml-milk-rice': 'milk-rice', 'new-ml-pol-roti': 'pol-roti',
  'new-ml-green-gram': 'green-gram', 'new-ml-chickpeas': 'chickpeas', 'new-ml-noodles': 'noodles',
  'new-br-bread-dhal': 'bread-dhal', 'new-br-bread-potato': 'bread-potato',
  'new-br-bread-add-egg': 'egg-curry', 'new-br-bread-add-fish': 'rice-fish', 'new-br-bread-add-chicken': 'chicken-curry',
  'new-sh-string-hoppers-10': 'string-hoppers', 'new-sh-string-hoppers-15': 'string-hoppers', 'new-sh-string-hoppers-20': 'string-hoppers',
  'new-sh-string-hoppers-add-5-more': 'string-hoppers', 'new-sh-string-hoppers-add-10-more': 'string-hoppers',
  'new-rt-egg-roll-egg': 'roll', 'new-rt-egg-roll-fish': 'roll',
  'new-rt-veg-roti': 'roti', 'new-rt-egg-roti-plain': 'roti', 'new-rt-egg-roti-gravy': 'roti',
  'new-rt-paratha': 'paratha', 'new-rt-wade': 'parippu-wade',
  'new-rt-ulundu-wade-plain': 'ulundu-wade', 'new-rt-ulundu-wade-gravy': 'ulundu-wade',
  'new-ot-plain-tea': 'plain-tea', 'new-ot-milk-tea': 'milk-tea', 'new-ot-coffee': 'coffee', 'new-ot-milk-coffee': 'milk-coffee',
  'new-ot-nestomalt': 'malt-drink', 'new-ot-milo': 'malt-drink',
  'new-dr-drink-buddy': 'soft-drink', 'new-dr-drink-medium': 'soft-drink',
  'new-dr-water-500ml': 'water', 'new-dr-water-1l': 'water', 'new-dr-water-1-5l': 'water',
  'new-dr-sun-crush': 'orange-drink', 'new-dr-faluda': 'faluda',
  'new-dr-pepsi-400ml': 'pepsi', 'new-dr-pepsi-1l': 'pepsi', 'new-dr-pepsi-1-5l': 'pepsi',
  'new-dr-coke-400ml': 'coca-cola', 'new-dr-coke-1l': 'coca-cola', 'new-dr-coke-1-5l': 'coca-cola',
  'new-dr-sprite-400': 'sprite', 'new-dr-mirinda-400': 'mirinda', 'new-dr-7up-400': '7up',
  'new-dr-egb-1000': 'ginger-beer', 'new-dr-soda-1500': 'soft-drink',
  'new-ot-popsicle': 'popsicle', 'new-ot-buns': 'buns', 'new-ot-muffin': 'muffin', 'new-ot-yoghurt': 'yoghurt',
  'new-ot-jelly': 'jelly', 'new-ot-watalappan': 'watalappan', 'new-ot-campa': 'soft-drink',
};

/** Bata Kade's photo for a dish, by its menu id; undefined for a dish of his own made later. */
export const SHOP_PHOTOS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FOOD).flatMap(([id, food]) => (byName[food] ? [[id, byName[food]]] : [])));
