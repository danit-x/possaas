/**
 * Parts of the POS a shop has switched on. Each shop gets the parts it is ready for; the rest stay
 * out of sight (no keys, no screens) until they are switched on. They come with the shop's details
 * from its own server (settings `features`), so they hold without internet.
 *
 * Two kitchens: sections set to the Right kitchen send their own ticket there, the Register has a
 * key per kitchen and a sent order flies off to its side. Off (Bata Kade for now, 2026-11-13):
 * one kitchen, whatever the menu's sections say; the menu keeps its Left/Right for later.
 */
export interface ShopFeatures {
  twoKitchens: boolean;
}

export const DEFAULT_FEATURES: ShopFeatures = { twoKitchens: false };

let current: ShopFeatures = { ...DEFAULT_FEATURES };

export const features = (): ShopFeatures => current;

/** What the shop's server says; anything it does not mention stays at its default. */
export const setFeatures = (next: Partial<ShopFeatures> | undefined): void => {
  current = { ...DEFAULT_FEATURES, ...(next ?? {}) };
};

/** Only the known parts, as true or false (a settings file or an answer may hold anything). */
export const cleanFeatures = (raw: unknown): Partial<ShopFeatures> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  return Object.fromEntries((Object.keys(DEFAULT_FEATURES) as (keyof ShopFeatures)[])
    .filter((k) => typeof r[k] === 'boolean').map((k) => [k, r[k]])) as Partial<ShopFeatures>;
};
