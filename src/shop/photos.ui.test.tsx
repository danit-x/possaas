import { expect, test } from 'vitest';
import { BATA_KADE_ITEMS } from './bataKade.ts';
import { SHOP_PHOTOS } from './photos.ts';

test("every Bata Kade dish has a photo in its card's square until the shop takes its own", () => {
  const missing = BATA_KADE_ITEMS.map(({ id }) => id).filter((id) => !SHOP_PHOTOS[id]);
  expect(missing).toEqual([]);
});
