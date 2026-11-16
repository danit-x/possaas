/**
 * The owner's and manager's screens share one sidebar (SCRUM-131), arranged by the shop's day
 * (the "Shop Day Navigation" plan): the work first, in the order the day uses it (Sell, Receive,
 * Today, Cash out), then the Menu and Customers, then Settings at the bottom. Every part keeps
 * its place: a badge marks where a decision waits, it never moves the part, because hands find
 * buttons by where they are. Each part has one line saying what is going on there. Ctrl K (or
 * "Ask or find") jumps to any part. On a narrow screen the list folds into a drawer.
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { modulesFromEvents, type ModuleId } from '../domain/modules.ts';
import { ownerParts, type PartId, type PartLine } from '../domain/ownerParts.ts';
import type { SyncEvent } from '../domain/sync.ts';
import { usesLogin } from '../services/auth.ts';
import { useShopEvents } from '../services/ownerData.ts';
import { isManagerPhone } from '../services/pairing.ts';
import { signedIn, subscribeAuth } from '../services/serverAuth.ts';
import { CommandPalette } from './CommandPalette.tsx';
import { restartHere } from './nav.ts';
import { SHOP_NAME } from '../shop/identity.ts';

export type Section = PartId;

/** The work, in the order the day uses it; then the things the shop holds; Settings apart, at the bottom. */
const WORK: { id: Section; label: string }[] = [
  { id: 'sell', label: 'Sell' },
  { id: 'owner', label: 'Today' },
  { id: 'cashout', label: 'Cash out' },
];
const THINGS: { id: Section; label: string }[] = [
  { id: 'menu', label: 'Menu' }, { id: 'customers', label: 'Customers' },
];
/** Parts that are modules (modules.ts): in the list only while the developers have them on. */
const MODULE_PARTS: Partial<Record<Section, ModuleId>> = { customers: 'crm' };
const SETTINGS: { id: Section; label: string } = { id: 'setup', label: 'Settings' };

/** Every screen beside the sidebar reads the same history, so its lines are worked out once. */
let last: { events: readonly SyncEvent[]; lines: Record<Section, PartLine> } | null = null;
const linesFor = (events: readonly SyncEvent[], at: number) => {
  if (last?.events !== events) last = { events, lines: ownerParts(events, at) };
  return last.lines;
};

const icon = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
/** Simple line icons, so a part is recognised before its name is read. */
const ICONS: Record<Section, ReactNode> = {
  sell: icon(<><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M7 21h10M12 17v4M7 10h4" /></>),
  owner: icon(<><path d="M4 19V10M10 19V5M16 19v-7M22 19H2" /></>),
  cashout: icon(<><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M12 2v9M8.5 7.5L12 11l3.5-3.5" /></>),
  menu: icon(<><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>),
  customers: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></>),
  setup: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>),
};

export function OwnerNav({ current, onRegister, drawer: held, onDrawer }: {
  current: Section;
  /** Back to selling. Without it, a plain link to the Register. */
  onRegister?: () => void;
  /**
   * Given, the list is a drawer at every width, opened by the screen's own button (Visual Flow keeps
   * the whole screen for its drawing).
   */
  drawer?: boolean;
  onDrawer?: (open: boolean) => void;
}) {
  const role = useSyncExternalStore(subscribeAuth, () => signedIn()?.role ?? null);
  const isOwner = !usesLogin() || role === 'owner';
  // The manager's phone app (SCRUM-94): counts and stock only, and no Register.
  const phone = isManagerPhone();
  const data = useShopEvents();
  const events = data.state === 'loading' ? undefined : data.events;
  const at = data.state === 'loading' ? 0 : data.at ?? Date.now();
  const lines = useMemo(() => (events ? linesFor(events, at) : null), [events, at]);
  const [own, setOwn] = useState(false);
  const drawerOnly = held !== undefined;
  const drawer = drawerOnly ? held : own;
  const setDrawer = (open: boolean) => (drawerOnly ? onDrawer?.(open) : setOwn(open));
  const [asking, setAsking] = useState(false);

  const modules = useMemo(() => modulesFromEvents(events ?? []), [events]);
  const shown = (list: { id: Section; label: string }[]) =>
    list.filter((p) => !phone && (MODULE_PARTS[p.id] === undefined || modules[MODULE_PARTS[p.id]!]));
  const work = shown(WORK);
  const things = shown(THINGS);
  const parts = [...work, ...things, ...(phone ? [] : [SETTINGS])];
  const here = parts.find((p) => p.id === current);
  void isOwner; // every part is open to owners and managers; inside Items the recipes are the owner's

  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAsking(true); }
      else if (e.key === 'Escape' && (asking || drawer)) { e.stopImmediatePropagation(); setAsking(false); setDrawer(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phone, asking, drawer, drawerOnly, onDrawer]);

  /** Sell is the register itself; the rest are this area's screens. */
  const go = (id: Section) => { if (id === 'sell') sell(); else location.hash = `#${id}`; };
  const sell = () => (onRegister ? onRegister() : void (location.hash = ''));
  const row = (p: { id: Section; label: string }) => {
    const line = lines?.[p.id];
    return (
      <li key={p.id}>
        <a
          href={p.id === 'sell' ? '#' : `#${p.id}`} className={`side__part side__part--${p.id}`} aria-current={p.id === current ? 'page' : undefined}
          aria-label={p.label} aria-describedby={`side-${p.id}`}
          onClick={(e) => {
            setDrawer(false);
            if (p.id === 'sell') { e.preventDefault(); sell(); }
            // Already here (Receive on GRN's Done): the part starts over instead of doing nothing.
            else if (location.hash === `#${p.id}`) { e.preventDefault(); restartHere(); }
          }}
        >
          <span className="side__icon" aria-hidden="true">{ICONS[p.id]}</span>
          <span className="side__text">
            <span className="side__label">{p.label}</span>
            {line ? <span className="side__preview" id={`side-${p.id}`}>{line.preview}</span>
              : <span className="side__preview skeleton" id={`side-${p.id}`} />}
          </span>
          {line && line.badge > 0 && <span className="side__badge num" aria-hidden="true">{line.badge}</span>}
        </a>
      </li>
    );
  };

  return (
    <>
      {!drawerOnly && <div className="side-top">
        <button type="button" className="side-top__open" aria-label="Show the parts of the shop" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
          </svg>
        </button>
        <span className="side-top__title">{here?.label ?? SHOP_NAME}</span>
      </div>}
      {drawer && <div className="side__scrim" onClick={() => setDrawer(false)} />}
      <nav className={`side${drawerOnly ? ' side--drawer' : ''}${drawer ? ' side--open' : ''}`} aria-label="Owner sections">
        <div className="side__head">
          <span className="brand">{SHOP_NAME}</span>
        </div>
        {!phone && (
          <button type="button" className="side__ask" onClick={() => setAsking(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <span>Ask or find…</span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        <h2 className="side__group">Work</h2>
        <ul className="side__list">{work.map(row)}</ul>
        <h2 className="side__group">Things</h2>
        <ul className="side__list">{things.map(row)}</ul>
        {!phone && <ul className="side__list side__foot">{row(SETTINGS)}</ul>}
      </nav>
      {asking && (
        <CommandPalette
          placeholder="Ask or find…"
          commands={[
            // Its line too, so "onion" finds Stock when onion is what is going on there.
            ...parts.map((p) => ({ id: p.id, label: lines ? `${p.label} · ${lines[p.id].preview}` : p.label, run: () => go(p.id) })),
          ]}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}
