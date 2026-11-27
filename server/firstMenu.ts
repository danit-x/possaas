import { bataKadeMenuEvents } from '../src/shop/bataKade.ts';
import type { SyncedEvent } from '../src/domain/sync.ts';
import type { Device, EventStore } from './store.ts';

/**
 * Bata Kade's menu ships with the app (src/shop/bataKade.ts). Each time the server starts, the shop's
 * counter's first pull stores it as ordinary menu events, so it reaches the counter, the kitchen and
 * the cloud like a menu typed in by hand. The events' fixed ids make this a no-op once they are
 * stored: the menu is never doubled, an item the owner took off stays off, and his own price changes
 * (newer events) stay.
 */
export function firstMenu({ store, shopId, now = Date.now }: {
  store: EventStore; shopId: () => string | undefined; now?: () => number;
}): (device: Device) => Promise<SyncedEvent[]> {
  const asked = new Map<string, Promise<SyncedEvent[]>>();
  const add = async (device: Device): Promise<SyncedEvent[]> => {
    const { stored } = await store.push(device, bataKadeMenuEvents(device.tenantId, now()), now());
    if (stored.length) console.log(`Added the shop's menu: ${stored.length} menu events`);
    return stored;
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
