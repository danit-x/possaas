import { useFeatures } from '../services/shop.ts';
import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_NAME } from '../domain/brand.ts';
import { businessDayStart } from '../domain/cashUp.ts';
import { rulesSuggestions, type Insight } from '../domain/insights.ts';
import { cashOutsBetween, type CashOutDay } from '../domain/cashOut.ts';
import { fmt } from '../domain/money.ts';
import { useInstall } from '../services/ownerApp.ts';
import { adminShop } from '../services/pairing.ts';
import { useShopEvents } from '../services/ownerData.ts';
import { OwnerNav } from './OwnerNav.tsx';
import { PastDays } from './PastDays.tsx';
import { ShopBrand } from './Brand.tsx';
import { isDemo } from './storage.ts';

/**
 * The Owner view. Serves the owner: they know the shop, not the screens, and
 * read this on a phone between other things. The one question it answers is
 * "does anything need me?": today in one line, then ONE feed of cards, each
 * with one tap behind it. No charts, no tables (CLAUDE.md).
 */
const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Detail({ insight, onClose }: { insight: Insight; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet owner-sheet" role="dialog" aria-modal="true" aria-label={insight.title}>
        <div className="sheet__body">
          <div className="sheet__title">
            <h1>{insight.title}</h1>
            <button type="button" className="linkbtn" onClick={onClose} autoFocus>Close</button>
          </div>
          <ul className="owner-list">
            {insight.action.items.map((item, i) => (
              <li key={i}>
                <span className="owner-list__main">
                  <span>{item.primary}</span>
                  {(item.secondary || item.at) && (
                    <span className="owner-list__sub">
                      {[item.secondary, item.at ? timeOf(item.at) : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {item.amount !== undefined && <span className="owner-list__amount num">{fmt(item.amount)}</span>}
                {item.value !== undefined && <span className="owner-list__amount num">{item.value}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

const clockOf = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

/**
 * Cash out at a glance, first under Today: what left the drawer today and in how many lines.
 * One tap: on the counter, the Cash out screen; elsewhere (the phone, the demo), the list itself.
 */
function CashOutBox({ day, onOpen }: { day: CashOutDay; onOpen: () => void }) {
  const n = day.lines.length;
  const items = n === 0 ? 'nothing yet today' : `${n} ${n === 1 ? 'item' : 'items'}`;
  return (
    <button type="button" className="cashbox" onClick={onOpen} aria-label={`Cash out today: Rs ${fmt(day.total)}, ${items}`}>
      <span className="cashbox__head"><span className="owner__label">Cash out today</span><span aria-hidden className="cashbox__go">›</span></span>
      <span className="cashbox__big num">Rs {fmt(day.total)}</span>
      <span className="cashbox__sub">{day.lines.slice(-3).map((l) => l.name).join(', ') || items}{n > 3 ? ` and ${n - 3} more` : ''}</span>
    </button>
  );
}

/** The list behind the box where there is no Cash out screen (the phone, the demo): today's lines, oldest first. */
const cashOutList = (day: CashOutDay): Insight => ({
  id: 'cashout', tone: 'info', title: `Cash out today · Rs ${fmt(day.total)}`, detail: '',
  action: { label: 'Open', items: day.lines.map((l) => ({ primary: l.name, secondary: `${clockOf(l.at)} · ${l.by}`, amount: l.amount })) },
});

/**
 * `phone`: on the owner's phone (the cloud site): no links to the counter's screens.
 * `onBack`: back to the Register (F7 does the same).
 */
export function OwnerView({ phone = false, onBack, shop }: {
  phone?: boolean;
  onBack?: () => void;
  /** Another shop, from the developer's Shops screen: its id in the header, Back goes to Shops. */
  shop?: string;
} = {}) {
  const data = useShopEvents();
  const parts = useFeatures();
  const install = useInstall();
  /** The developer's admin view of a shop: not an owner's phone, so no home-screen offer. */
  const offerInstall = phone && !adminShop();
  const [open, setOpen] = useState<string | null>(null);
  const [past, setPast] = useState(false);
  const events = data.state === 'ready' ? data.events : data.state === 'error' ? data.events : undefined;
  const at = (data.state === 'loading' ? undefined : data.at) ?? Date.now();
  const clockOffMs = data.state === 'ready' ? data.clockOffMs : undefined;

  const { summary, insights } = useMemo(() => {
    if (!events) return { summary: null, insights: [] as Insight[] };
    const shop = { events, now: at, clockOffMs };
    return { summary: rulesSuggestions.summary(shop), insights: rulesSuggestions.insights(shop) };
  }, [events, at, clockOffMs]);
  /** Today's cash out; no box at all for a shop that has never written one. */
  const cashOut = useMemo(() => {
    if (!events?.some((e) => e.type === 'cash.out')) return null;
    const from = businessDayStart(at);
    return cashOutsBetween(events, from, from + 24 * 60 * 60_000);
  }, [events, at]);
  const opened = open === 'cashout' && cashOut ? cashOutList(cashOut) : insights.find((i) => i.id === open) ?? null;
  /**
   * The counter goes to the Cash out screen; the phone, the developer's views and the demo (made-up
   * history the Cash out screen does not have) list it instead.
   */
  const openCashOut = () => { if (!phone && !shop && !isDemo()) location.hash = '#cashout'; else setOpen('cashout'); };

  return (
    <div className="owner">
      {shop ? (
        <header className="owner__head">
          <button type="button" className="shops__back" onClick={onBack}>Shops</button>
          <span className="brand">{shop}</span>
          {data.state !== 'loading' && <span className="owner__updated">Updated {timeOf(at)}</span>}
        </header>
      ) : phone ? (
        <header className="owner__head">
          <ShopBrand />
          {data.state !== 'loading' && <span className="owner__updated">Updated {timeOf(at)}</span>}
        </header>
      ) : <OwnerNav current="owner" onRegister={onBack} />}

      <main className="owner__main" aria-label="Owner">
        <section className="owner__today" aria-label="Today">
          <span className="owner__label">
            Today · {new Date(at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          {summary ? (
            <>
              <span className="owner__big num">Rs {fmt(summary.salesCents)}</span>
              <span className="owner__sub num">
                {summary.orders} {summary.orders === 1 ? 'order' : 'orders'}
                {summary.orders > 0 && ` · average Rs ${fmt(Math.round(summary.averageCents / 100) * 100)}`}
              </span>
            </>
          ) : (
            <span className="owner__big skeleton" aria-label="Loading" />
          )}
        </section>

        {cashOut && parts.cashOut && <CashOutBox day={cashOut} onOpen={openCashOut} />}

        {offerInstall && install.kind === 'button' && (
          <p className="owner__install">
            <span>Put {PRODUCT_NAME} on your home screen.</span>
            <button type="button" className="insight__action" onClick={install.install}>Install app</button>
          </p>
        )}
        {offerInstall && install.kind === 'iphone' && (
          <p className="owner__install">To put it on your home screen: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>
        )}

        {data.state === 'error' && (
          <p className="owner__note" role="status">
            {data.message.startsWith('This link')
              ? `${data.message} Ask for a new one.`
              : `${phone ? 'No connection' : 'Can’t reach the shop server'}${events ? `: showing the figures from ${timeOf(at)}.` : '.'}`}
          </p>
        )}

        <section className="owner__feed" aria-label="Needs your attention">
          {!events && [0, 1, 2].map((i) => <div key={i} className="insight skeleton" aria-hidden />)}
          {events && insights.length === 0 && <p className="owner__calm">Nothing needs you right now.</p>}
          {insights.map((i) => (
            <article key={i.id} className={`insight insight--${i.tone}`} aria-label={i.title}>
              <div className="insight__text">
                <h2>{i.title}</h2>
                <p>{i.detail}</p>
              </div>
              <button type="button" className="insight__action" onClick={() => setOpen(i.id)}>{i.action.label}</button>
            </article>
          ))}
        </section>

        {events && <button type="button" className="linkbtn owner__past" onClick={() => setPast(true)}>Past days</button>}
      </main>

      {opened && <Detail insight={opened} onClose={() => setOpen(null)} />}
      {past && events && <PastDays events={events} now={at} onClose={() => setPast(false)} />}
    </div>
  );
}
