import { useSyncExternalStore } from 'react';
import { menuState, menuVersion, openSectionsKey, setMenuState, subscribeMenu } from '../domain/menu.ts';
import { menuStateFromEvents } from '../domain/menuEdits.ts';
import { readAll, subscribeEvents } from './eventLog.ts';
import { bataKadeMenuEvents } from '../shop/bataKade.ts';
import type { SyncEvent } from '../domain/sync.ts';

/**
 * Keeps this screen's menu in step with the shop's menu events (from the event log, which
 * keeps them for good), and re-checks "sold out until morning" every minute.
 */
let started = false;
/**
 * Bata Kade's menu comes first, under the shop's own menu events (the shop server stores the same
 * events, with the same ids, on the counter's first pull: server/firstMenu.ts), so every screen shows
 * it even before the first sync, and the owner's later changes win. The tests keep the printed menu.
 * Worked out when asked, so a test can switch the real menu on (vi.stubEnv('MODE', ...)).
 */
let base: { mode: string; events: SyncEvent[] } | undefined;
const baseMenu = (): SyncEvent[] => {
  const mode = import.meta.env.MODE;
  if (base?.mode !== mode) base = { mode, events: mode === 'test' ? [] : bataKadeMenuEvents('', 0) };
  return base.events;
};
/**
 * The shop's menu from its menu events, always on top of Bata Kade's: every screen that folds the
 * menu goes through here (the event log here, the shop's history in ownerData.ts), so none drops it.
 */
export const shopMenuState = (menuEvents: SyncEvent[]) => menuStateFromEvents([...baseMenu(), ...menuEvents]);
const refresh = () => setMenuState(shopMenuState(readAll().filter((e) => e.type.startsWith('menu.'))));

const start = () => {
  if (started) return;
  started = true;
  refresh();
  subscribeEvents(refresh);
  // Sold-out items come back by themselves in the morning; a section opens or closes at its hours.
  let open = openSectionsKey();
  setInterval(() => {
    const now = openSectionsKey();
    if (Object.keys(menuState().soldOut).length || now !== open) refresh();
    open = now;
  }, 60_000);
};

/** Re-renders when the menu changes. Any screen showing items or prices calls it. */
export const useMenu = (): number => {
  start();
  return useSyncExternalStore(subscribeMenu, menuVersion);
};
