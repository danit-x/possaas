/**
 * The photos Bata Kade's menu comes with (src/shop/photos, 480 × 360 JPEG; where each came from: SOURCES.md), by the item's id in
 * src/shop/bataKade.ts. An item the shop never gave its own photo shows this one; the owner replaces
 * or removes it on the item's sheet. STAND-INS from Unsplash and a web image search (2026-11-14):
 * the owner's own photos replace them, and they never go on the public online ordering page.
 */
const files = import.meta.glob('./photos/*.jpg', { eager: true, import: 'default' }) as Record<string, string>;
const byKey: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice('./photos/'.length, -'.jpg'.length), url]),
);

/**
 * 'new-rc-m-egg' (a shop server's copy) and 'rc-d-egg' → 'rc-egg': one photo for the item at every
 * time of day, on the demo and on the shop.
 */
export const photoKey = (itemId: string): string => itemId.replace(/^new-/, '').replace(/^rc-[md]-/, 'rc-');

export const bataKadePhoto = (itemId: string): string | undefined => byKey[photoKey(itemId)];
