import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_NAME } from '../domain/brand.ts';
import { businessDayStart } from '../domain/cashUp.ts';
import { rulesSuggestions, type Insight } from '../domain/insights.ts';
import { payOutSummary, waited, type PayOutSummary } from '../domain/supplies.ts';
import { fmt } from '../domain/money.ts';
import { useInstall } from '../services/ownerApp.ts';
import { adminShop } from '../services/pairing.ts';
import { useShopEvents } from '../services/ownerData.ts';
import { sendWaiting, settle, usePhoneWaiting } from '../services/phonePayOut.ts';
import { PayOutSheet } from './PayOutPhone.tsx';
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

/**
 * Pay out at a glance, first under Today: paid out today (drawer, bank), what is still owed,
 * and the debt that has waited longest. One tap: on the counter, the Pay out screen; elsewhere
 * (the phone), the list of who is owed and what was paid today.
 */
function PayOutBox({ s, now, onOpen }: { s: PayOutSummary; now: number; onOpen: () => void }) {
  const paid = s.today.drawer + s.today.bank;
  const ways = ([['From the drawer', s.today.drawer], ['From the bank', s.today.bank]] as const).filter(([, c]) => c > 0);
  return (
    <button type="button" className="payoutbox" onClick={onOpen} aria-label={`Pay out: Rs ${fmt(paid)} today, Rs ${fmt(s.owed)} still owed`}>
      <span className="payoutbox__head"><span className="owner__label">Pay out today</span><span aria-hidden className="payoutbox__go">›</span></span>
      <span className="payoutbox__big num">Rs {fmt(paid)}</span>
      {ways.map(([label, cents]) => (
        <span key={label} className="payoutbox__row"><span>{label}</span><span className="num">{fmt(cents)}</span></span>
      ))}
      <span className="payoutbox__row payoutbox__owed"><span>Still owe</span><span className="num">{s.owed ? fmt(s.owed) : 'nothing'}</span></span>
      {s.overdue && s.overdue.owedSince !== null && (
        <span className="payoutbox__warn">{s.overdue.name} unpaid {waited(s.overdue.owedSince, now)}</span>
      )}
    </button>
  );
}

/** The phone's list behind the box: who is owed (longest first), then today's payments. */
const payOutList = (s: PayOutSummary, now: number): Insight => ({
  id: 'payout', tone: 'info', title: 'Pay out', detail: '',
  action: {
    label: 'Open',
    items: [
      ...s.owing.map((o) => ({ primary: o.name, secondary: `Owed · ${o.owedSince === null ? '' : waited(o.owedSince, now)}`, amount: o.owed })),
      ...s.today.to.map((p) => ({ primary: p.name, secondary: `Paid today · ${p.from === 'bank' ? 'bank' : 'drawer'}`, amount: p.amount })),
    ],
  },
});

/**
 * `phone`: on the owner's phone (the cloud site): no links to the counter's screens.
 * `onBack`: back to the Register (F3 does the same).
 */
export function OwnerView({ phone = false, onBack, shop }: {
  phone?: boolean;
  onBack?: () => void;
  /** Another shop, from the developer's Shops screen: its id in the header, Back goes to Shops. */
  shop?: string;
} = {}) {
  const data = useShopEvents();
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
  /** The owner records Pay out here on the phone (and in the demo); the developer's views only look. */
  const records = !shop && (phone ? !adminShop() : isDemo());
  const waiting = usePhoneWaiting();
  // What the shop has sent back stops waiting on the phone; whatever has not gone yet goes now.
  useEffect(() => {
    if (!records || !events) return;
    settle(new Set(events.map((e) => e.id)));
    void sendWaiting();
  }, [records, events]);
  /** The shop's events, and this phone's own entries the shop has not sent back yet (counted at once). */
  const withMine = useMemo(() => {
    if (!events || !records || !waiting.length) return events;
    const known = new Set(events.map((e) => e.id));
    return [...events, ...waiting.filter((w) => !known.has(w.event.id)).map((w) => w.event)];
  }, [events, records, waiting]);
  const payOut = useMemo(() => (withMine ? payOutSummary(withMine, businessDayStart(at), at) : null), [withMine, at]);
  const opened = open === 'payout' && payOut && !records ? payOutList(payOut, at) : insights.find((i) => i.id === open) ?? null;
  /**
   * The counter goes to the Pay out screen; the phone and the demo (made-up history the Pay out
   * screen does not have) open the phone's Pay out; the developer's views list it.
   */
  const openPayOut = () => { if (!phone && !shop && !isDemo()) location.hash = '#payout'; else setOpen('payout'); };

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

        {payOut && <PayOutBox s={payOut} now={at} onOpen={openPayOut} />}

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
      {open === 'payout' && records && withMine && (
        <PayOutSheet events={withMine} now={at} waiting={isDemo() ? 0 : waiting.filter((w) => !events?.some((e) => e.id === w.event.id)).length} onClose={() => setOpen(null)} />
      )}
      {past && events && <PastDays events={events} now={at} onClose={() => setPast(false)} />}
    </div>
  );
}
