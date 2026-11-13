import { EMPTY_MENU_STATE, type StartingMenu } from '../src/domain/menuEdits.ts';
import { loadMenu, menuFile, menuLoadEvents } from '../src/domain/menuFile.ts';
import { menuUpdateEvents, type MenuUpdate } from '../src/domain/menuUpdate.ts';
import type { SyncEvent, SyncedEvent } from '../src/domain/sync.ts';
import type { Device, EventStore } from './store.ts';

/** A shop's menu events so far, oldest first (read once per server start). */
async function menuEvents(store: EventStore, tenantId: string): Promise<SyncEvent[]> {
  const out: SyncEvent[] = [];
  for (let after = 0; ;) {
    const page = await store.pull(tenantId, after, 1000);
    if (!page.length) return out;
    for (const e of page) if (e.event.type.startsWith('menu.')) out.push(e.event);
    after = page[page.length - 1].seq;
  }
}

/** Who added the shop's first menu: the POS itself, not a person (it shows in the audit as this). */
export const MENU_INSTALLER = { id: 'lume-pos', name: 'Lume POS', role: 'owner' as const };

/**
 * possaas is Bata Kade's POS: its menu ships with the app. Each time the server starts, the shop's
 * counter's first pull sends the menu as ordinary menu events, so it reaches the counter, the
 * kitchen and the cloud like a menu typed in by hand. The events' fixed ids make this a no-op once
 * they are stored: the server keeps one event per id, so the menu is never doubled, an item the
 * owner took off stays off, and the owner's own price changes (newer events) stay.
 */
export function firstMenu({ store, menu, updates = [], shopId, now = Date.now }: {
  store: EventStore; menu: StartingMenu; updates?: readonly MenuUpdate[]; shopId: () => string | undefined; now?: () => number;
}): (device: Device) => Promise<SyncedEvent[]> {
  const asked = new Map<string, Promise<SyncedEvent[]>>();
  const add = async (device: Device): Promise<SyncedEvent[]> => {
    const load = loadMenu(menuFile(menu, EMPTY_MENU_STATE), { sections: [], items: [] });
    if (typeof load === 'string') { console.error(`The shop's menu could not be added: ${load}`); return []; }
    const { stored } = await store.push(device, menuLoadEvents(load, device.tenantId, MENU_INSTALLER, now()), now());
    if (stored.length) console.log(`Added the shop's menu: ${load.sections.length} sections, ${load.items.length} items`);
    if (!updates.length) return stored;
    // Then the menu's updates (src/domain/menuUpdate.ts), after everything the shop already has.
    const existing = await menuEvents(store, device.tenantId);
    const changes = await store.push(device, menuUpdateEvents(updates, menu, existing, device.tenantId, MENU_INSTALLER, now()), now());
    if (changes.stored.length) console.log(`Updated the shop's menu: ${changes.stored.length} changes`);
    return [...stored, ...changes.stored];
  };
  return (device) => {
    if (device.kind !== 'counter' || device.tenantId !== shopId()) return Promise.resolve([]);
    if (!asked.has(device.tenantId)) {
      asked.set(device.tenantId, add(device).catch((e: unknown) => { asked.delete(device.tenantId); throw e; }));
      return asked.get(device.tenantId)!;
    }
    return Promise.resolve([]);
  };
}
