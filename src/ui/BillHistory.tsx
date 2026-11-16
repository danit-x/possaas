import { useState } from 'react';
import { cookState, type KitchenTicket } from '../domain/kitchen.ts';
import { fmt } from '../domain/money.ts';
import { balanceDue, orderTotal } from '../domain/order.ts';
import type { PaidOrder } from '../domain/types.ts';
import { label } from './labels.ts';
import { COOK_LABEL, OnlineTag, TENDER, orderSummary } from './OrderPanel.tsx';
import type { RailRow } from './OrdersRail.tsx';
import { useNow } from './Kitchen.tsx';

/** Held this long, the bill's wait turns heavy: someone may have been forgotten. */
const LATE_MIN = 30;

const waitText = (since: number, now: number): string => {
  const m = Math.floor((now - since) / 60_000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

const timeText = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

type Show = 'all' | 'held' | 'paid';


/**
 * The left of the counter: every bill of the day in sight, the way the old POS showed them.
 * Held bills first (every other bill still going: not paid, or paid and not yet given), then Paid
 * today, newest first. A tap opens the bill on the right; the one on screen is marked.
 * `paidToday` is empty for a cashier who does not see the takings.
 */
export function BillHistory({ held, paidToday, tickets, kitchenOn, current, onOpen }: {
  held: RailRow[];
  paidToday: PaidOrder[];
  tickets: KitchenTicket[];
  /** The Kitchen view is on: held bills say how they stand with the kitchen. */
  kitchenOn: boolean;
  /** The bill on screen: its number, and its paid time when it is a paid bill. */
  current: { number: number; paidAt?: number };
  onOpen: (number: number) => void;
}) {
  const now = useNow(30_000);
  const [find, setFind] = useState('');
  const [show, setShow] = useState<Show>('all');
  const q = find.trim().toLowerCase();
  const hits = (number: number, what: string) => !q || String(number).includes(q) || what.toLowerCase().includes(q);
  const heldShown = held.filter((r) => hits(r.order.number, `${r.order.customer?.name ?? ''} ${orderSummary(r.order.lines)}`));
  const paidShown = paidToday.filter((o) => hits(o.number, orderSummary(o.lines)));
  const heldSum = held.reduce((s, r) => s + orderTotal(r.order), 0);
  const paidSum = paidToday.reduce((s, o) => s + o.total + (o.settled ?? 0), 0);
  const takings = paidToday.length > 0;
  return (
    <nav className="history" aria-label="Order history">
      <div className="history__tools">
        <input className="history__find" type="search" value={find} placeholder="Bill no or item" aria-label="Find a bill"
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setFind(''); e.currentTarget.blur(); } }} />
        {takings && (
          <div className="history__show" role="group" aria-label="Show">
            {(['all', 'held', 'paid'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>
                {k === 'all' ? 'All' : k === 'held' ? <>Held <span className="num">{held.length}</span></> : <>Paid <span className="num">{paidToday.length}</span></>}
              </button>
            ))}
          </div>
        )}
      </div>
      {show !== 'paid' && (
      <section className="history__part">
        <div className="history__bar">
          <h2 className="history__head">{label('heldBills')} · <span className="num">{held.length}</span></h2>
          {heldSum > 0 && <span className="history__sum num">{fmt(heldSum)}</span>}
        </div>
        {held.length === 0 && <p className="history__none">{label('noHeld')}</p>}
        {held.length > 0 && heldShown.length === 0 && <p className="history__none">No match</p>}
        <ul className="history__list" aria-label={label('heldBills')}>
          {heldShown.map((r) => {
            const waited = !r.paid && r.order.sentAt !== undefined ? now - r.order.sentAt : undefined;
            const on = current.number === r.order.number && (current.paidAt === undefined || (r.paid && (r.order as PaidOrder).paidAt === current.paidAt));
            return (
            <li key={r.order.number}>
              <button type="button" className={`history__row history__row--held${on ? ' history__row--on' : ''}${r.ready && r.ready.urgency !== 'ok' ? ` history__row--${r.ready.urgency}` : ''}`}
                aria-current={on || undefined} data-rail-order={r.order.number} onClick={() => onOpen(r.order.number)}>
                <span className="history__top">
                  <span className="history__no num">{r.order.number}</span>
                  <span className="history__total num">{fmt(orderTotal(r.order))}</span>
                </span>
                <span className="history__what">{r.order.customer?.name && <b>{r.order.customer.name} · </b>}{orderSummary(r.order.lines)}</span>
                <span className="history__meta">
                  {waited !== undefined && r.order.sentAt !== undefined && (
                    <span className={`history__wait${waited >= LATE_MIN * 60_000 ? ' history__wait--late' : ''}`}>{waitText(r.order.sentAt, now)}</span>
                  )}
                  {/* No Kitchen view: "Not sent" would mean nothing to the cashier. */}
                  {(kitchenOn || r.order.sentAt !== undefined) && <span>{r.ready?.label ?? r.kitchen}</span>}
                  <span className={r.paid ? 'held__paid' : 'held__unpaid history__pill'}>{r.paid ? 'Paid' : 'Not paid'}</span>
                  {r.order.dineIn && <span>{label('dineIn')}</span>}
                  <OnlineTag order={r.order} />
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      </section>
      )}
      {takings && show !== 'held' && (
        <section className="history__part" aria-label="Paid today">
          <div className="history__bar">
            <h2 className="history__head">Paid today · <span className="num">{paidToday.length}</span></h2>
            <span className="history__sum num">{fmt(paidSum)}</span>
          </div>
          {paidShown.length === 0 && <p className="history__none">No match</p>}
          <ul className="history__list history__list--paid">
            {paidShown.map((o) => {
              const on = current.number === o.number && current.paidAt === o.paidAt;
              // No Kitchen view: nobody marks it made, so "Waiting" would never change.
              const cook = kitchenOn && o.sentAt !== undefined ? cookState(tickets, o.number) : 'done';
              return (
                <li key={`${o.number}-${o.paidAt}`}>
                  <button type="button" className={`history__row history__row--paid${on ? ' history__row--on' : ''}`}
                    aria-current={on || undefined} data-rail-order={o.number} onClick={() => onOpen(o.number)}>
                    <span className="history__top">
                      <span className="history__no num">{o.number}</span>
                      {/* Changed after paying (SCRUM-247): what it comes to now. */}
                      <span className="history__total num">{fmt(o.settled ? o.total + o.settled : o.total)}</span>
                    </span>
                    <span className="history__what">{orderSummary(o.lines)}</span>
                    <span className="history__meta">
                      <span className="history__time num">{timeText(o.paidAt)}</span>
                      {/* Paid, food still coming: the customer is still waiting, so the kitchen state stays. */}
                      {cook !== 'done' && <span className={`cookword cookword--${cook}`}>{COOK_LABEL[cook]}</span>}
                      <span className="cookword cookword--paid">Paid · {o.parts?.length ? 'Split' : TENDER[o.tender]}</span>
                      {o.settled ? <span className="cookword num">{o.settled < 0 ? `Gave back ${fmt(-o.settled)}` : `Paid ${fmt(o.settled)} more`}</span> : null}
                      {/* Changed after paying, money not yet taken or given (SCRUM-253). */}
                      {balanceDue(o) !== 0 && <span className="cookword cookword--due num">{balanceDue(o) > 0 ? `To pay ${fmt(balanceDue(o))}` : `To give back ${fmt(-balanceDue(o))}`}</span>}
                      <OnlineTag order={o} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </nav>
  );
}
