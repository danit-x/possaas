import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { seesTakings } from '../domain/auth.ts';
import { voicePages } from '../domain/voicePages.ts';
import { usesLogin } from '../services/auth.ts';
import { adminShop, fleetShop, isCloudSite, isKitchenDevice, isManagerPhone, ownerToken, syncToken } from '../services/pairing.ts';
import { isDemo } from './storage.ts';
import { lock, signedIn, subscribeAuth } from '../services/serverAuth.ts';
import { App } from './App.tsx';
import { CashOut } from './CashOut.tsx';
import { Kitchen } from './Kitchen.tsx';
import { LockScreen } from './LockScreen.tsx';
import { MenuView } from './MenuView.tsx';
import { useMenu } from './menuStore.ts';
import { OwnerView } from './OwnerView.tsx';
import { OwnerWelcome } from './OwnerWelcome.tsx';
import { ShopsView } from './ShopsView.tsx';
import { ReceiptPreview } from './ReceiptPreview.tsx';
import { SetupWizard } from './SetupWizard.tsx';
import { useVoice, VoiceNote } from './VoiceKey.tsx';
import { navigate, onNavigate, startNav, useBackKeys } from './nav.ts';
import { kitchenScreenOn } from './kitchenScreen.ts';
import { SHOP_NAME } from '../shop/identity.ts';

/** The developers' module codes (#unlock): opened once in a shop's life. */
const UnlockView = lazy(() => import('./UnlockView.tsx'));
/** Customers (CRM): a module, on only where the developers turned it on. */
const CustomersView = lazy(() => import('./customers/CustomersView.tsx'));

const KITCHEN = '#kitchen';
const OWNER = '#owner';
const CASHOUT = '#cashout';

/** Changing screens cross-fades (view transitions, 200 ms in styles.css) where the browser can; instant elsewhere. */
const withTransition = (change: () => void) => {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (d.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) d.startViewTransition(() => flushSync(change));
  else change();
};
/** "A few quiet minutes" (SCRUM-40): long enough not to nag mid-service. */
export const IDLE_LOCK_MS = 5 * 60_000;

/** Locks the screen after a quiet spell. Any key or tap counts as activity. */
function useIdleLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let t = setTimeout(lock, IDLE_LOCK_MS);
    const awake = () => { clearTimeout(t); t = setTimeout(lock, IDLE_LOCK_MS); };
    window.addEventListener('keydown', awake, true);
    window.addEventListener('pointerdown', awake, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', awake, true);
      window.removeEventListener('pointerdown', awake, true);
    };
  }, [enabled]);
}

/**
 * Is this shop set up, and may this device set it up? Asked of the shop server
 * in the real build only; development and tests keep the fake staff.
 * 'remote' = a tablet or phone that has not scanned its QR code yet.
 */
type SetupCheck = 'checking' | 'none' | 'new' | 'done' | 'remote';
const checksSetup = () =>
  !isDemo() && !isCloudSite() && (import.meta.env.PROD || import.meta.env.VITE_SETUP_CHECK === '1');

function useSetupCheck(): SetupCheck {
  const [check, setCheck] = useState<SetupCheck>(checksSetup() ? 'checking' : 'none');
  useEffect(() => {
    if (!checksSetup()) return;
    fetch('/api/v1/setup', { signal: AbortSignal.timeout(10_000) }).then(
      async (r) => {
        if (r.status === 403) setCheck('remote');
        else if (!r.ok) setCheck('none');
        else setCheck(((await r.json()) as { done: boolean }).done ? 'done' : 'new');
      },
      () => setCheck('none'), // no shop server here (development)
    );
  }, []);
  return check;
}

/** A tablet or phone that is not connected yet: say so, never show a register. */
function NotConnected() {
  return (
    <main className="lock" aria-label="Not connected">
      <div className="lock__card owner-welcome">
        <span className="brand">{SHOP_NAME}</span>
        <h1 className="lock__title">This device is not connected yet</h1>
        <p>On the shop PC: Manager mode → Ctrl+K → Shop setup → Devices, then scan the QR code with this device.</p>
      </div>
    </main>
  );
}

/**
 * Which screen this device shows, and to whom.
 * - A kitchen device (paired as kitchen) shows the Kitchen only, with no login.
 * - On the counter, staff log in with their PIN (SCRUM-40); F4 switches user,
 *   and the screen locks itself when quiet. A kitchen login sees the Kitchen only.
 * - The Kitchen view is hidden on the counter until it is turned back on (kitchenScreen.ts);
 *   then the Kitchen key opens it and F2 comes back. F10 flips to the Owner view and back
 *   (owners and managers). The Kitchen stays visible while the
 *   screen is locked; only going back to the Register needs a PIN.
 * Development and the demo have no login (fake staff), as before.
 */
export function Root() {
  useMenu();
  const [hash, setHash] = useState(() => { startNav(); return location.hash; });
  /** Came here from the Register, so the Kitchen offers a way back. */
  const [fromRegister, setFromRegister] = useState(false);
  const needsLogin = usesLogin();
  const staff = useSyncExternalStore(subscribeAuth, signedIn);
  const kitchenOnly = isKitchenDevice() || staff?.role === 'kitchen';
  const setup = useSetupCheck();
  useIdleLock(needsLogin && staff !== null);

  useEffect(() => onNavigate(() => setHash(location.hash)), []);

  // The Kitchen view is hidden on the counter until it is turned back on (kitchenScreen.ts).
  const inKitchen = hash === KITCHEN && kitchenScreenOn();
  /** The Owner view shows the takings: owners and managers only (SCRUM-41). */
  const seesOwner = !kitchenOnly && (!needsLogin || (staff !== null && seesTakings(staff.role)));
  // Every move is one step (nav.ts), the Register too, so Back is always "where I just was".
  const go = useCallback((to: string) => withTransition(() => {
    navigate(to);
    if (to === KITCHEN) setFromRegister(true);
  }), []);
  const show = useCallback((kitchen: boolean) => go(kitchen ? KITCHEN : ''), [go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;
      // F2 … F8 are the Register's bill keys (ActionBar). From the Kitchen, F2 still goes back.
      if (e.key === 'F2' && !kitchenOnly && (inKitchen || (needsLogin && !staff && kitchenScreenOn()))) { e.preventDefault(); show(!inKitchen); }
      if (e.key === 'F10' && seesOwner) { e.preventDefault(); go(hash === OWNER ? '' : OWNER); }
      if (e.key === 'F4' && needsLogin && staff && (inKitchen || kitchenOnly)) { e.preventDefault(); lock(); }
      // Cash out and back (F1 is the browser's help page otherwise).
      if (e.key === 'F1' && !kitchenOnly && !isCloudSite() && (!needsLogin || staff)) { e.preventDefault(); go(hash === CASHOUT ? '' : CASHOUT); }
      // The developers' Modules page (#unlock): the installed app has no address bar, so a hidden
      // key opens it on the shop PC, locked or not; the developers' password is still the authority.
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyU' && !isCloudSite() && !isManagerPhone()) {
        e.preventDefault();
        go(hash === '#unlock' ? '' : '#unlock');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hash, inKitchen, show, go, seesOwner, kitchenOnly, needsLogin, staff]);

  // Opening a page by voice (SCRUM-145): only the pages this person could open anyway.
  const isOwnerHere = !needsLogin || staff?.role === 'owner';
  const pages = useMemo(() => voicePages({
    seesOwner, owner: isOwnerHere, setup: !needsLogin || staff?.role === 'owner' || staff?.role === 'manager',
  }), [seesOwner, isOwnerHere, needsLogin, staff]);
  const voiceOn = !isManagerPhone() && !isCloudSite() && (setup === 'none' || setup === 'done') && !kitchenOnly && (!needsLogin || staff !== null);
  const voice = useVoice(voiceOn ? pages : [], hash, go);

  const screen = renderScreen();
  // Back (Esc, the mouse's back button, Alt+←) may leave a place, never the Register, the lock,
  // setup or a kitchen screen with no Register to go back to.
  const atPlace = hash !== '' && !kitchenOnly && !isCloudSite() && (setup === 'none' || setup === 'done')
    && screen.type !== App && screen.type !== LockScreen && screen.type !== NotConnected
    && !(screen.type === SetupWizard && hash !== '#setup') && !(inKitchen && !fromRegister && !needsLogin);
  useBackKeys(atPlace);
  return voiceOn ? <>{screen}<VoiceNote voice={voice.voice} onBack={voice.back} /></> : screen;

  function renderScreen(): ReactElement {
  // The cloud site is the owner's phone page and nothing else (the demo for examiners too).
  // A manager's phone app (SCRUM-94): the counts and the stock, nothing else.
  if (isManagerPhone()) return <NotConnected />;
  if (isCloudSite()) {
    if (!(ownerToken() || isDemo() || adminShop())) return <OwnerWelcome />;
    return <OwnerView phone />;
  }
  if (setup === 'checking') return <div className="setup" aria-busy="true" />;
  // The developers' module codes (modules.ts): the shop PC itself (the setup API answers nothing else),
  // no pairing or login needed; the signed code is the authority.
  if (hash === '#unlock' && setup !== 'new' && setup !== 'remote') {
    return <Suspense fallback={<div className="setup" aria-busy="true" />}><UnlockView onClose={() => go('')} /></Suspense>;
  }
  if (setup === 'new') return <SetupWizard mode="first" />;
  if (setup === 'remote' && !syncToken()) return <NotConnected />;
  if (setup === 'done' && !syncToken()) return <SetupWizard mode="connect" />;
  // Staff, printer and devices later: the owner, with their PIN (the server checks it too).
  if (hash === '#setup' && (!needsLogin || staff?.role === 'owner' || staff?.role === 'manager')) {
    return <SetupWizard mode="manage" onClose={() => show(false)} />;
  }
  if (hash === '#receipt') return <ReceiptPreview />; // setup page, not a cashier screen
  if (kitchenOnly) return <Kitchen onSwitch={staff ? lock : undefined} />;
  if (inKitchen) return <Kitchen onBack={fromRegister || needsLogin ? () => show(false) : undefined} />;
  if (needsLogin && !staff) return <LockScreen />;
  // Managers and owners only (SCRUM-41, mayManageStock); anyone else typing the address gets the
  // Register. The server refuses a cashier's stock events anyway.
  if (hash === OWNER && seesOwner) return <OwnerView onBack={() => go('')} />;
  // The developer's Shops screen (only answers on the developer's laptop: server/fleet.ts).
  if (hash === '#shops' && seesOwner) return <ShopsView onBack={() => go('')} />;
  if (fleetShop() && seesOwner) return <OwnerView key={hash} shop={fleetShop()!} onBack={() => go('#shops')} />;
  // The owner changes the menu; managers can mark items sold out during service.
  if ((hash === '#items/finished' || hash === '#menu' || hash === '#items') && (!needsLogin || (staff !== null && seesTakings(staff.role)))) {
    return <MenuView owner={isOwnerHere} onBack={() => go('')} />;
  }
  // Cash out, the owner's paper list: anyone opens it (F1 on the Register); writing takes a manager's PIN.
  if (hash === CASHOUT) return <CashOut nav={seesOwner} onBack={() => go('')} />;
  if ((hash === '#customers' || hash.startsWith('#customers/')) && seesOwner) {
    return <Suspense fallback={<div className="inv-page" aria-busy="true" />}><CustomersView hash={hash} onRegister={() => go('')} /></Suspense>;
  }
  return (
    <App onKitchen={() => show(true)} onOwner={needsLogin && seesOwner ? () => go(OWNER) : undefined}
      onCashOut={() => go(CASHOUT)} onSwitch={needsLogin ? lock : undefined}
      onVoice={voiceOn ? { start: () => void voice.start(), stop: voice.stop } : undefined} />
  );
  }
}
