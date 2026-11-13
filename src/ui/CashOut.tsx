import { useEffect, useMemo, useRef, useState } from 'react';
import { canManage, type Actor } from '../domain/auth.ts';
import { businessDayStart } from '../domain/cashUp.ts';
import { cashOutsBetween, MAX_NAME, namesByUse, parseCashOut } from '../domain/cashOut.ts';
import { fmt } from '../domain/money.ts';
import { currentCashier } from '../services/auth.ts';
import { ShopBrand } from './Brand.tsx';
import { appendEvent, readAll, subscribeEvents } from './eventLog.ts';
import { OwnerNav } from './OwnerNav.tsx';
import { PinSheet } from './PinSheet.tsx';

/**
 * Cash out (#cashout, F3 on the Register): the owner's paper list on the shop PC. Serves the
 * owner or a manager who has just paid someone from the drawer (the fish man, the bank, gas):
 * they know who and how much; the single next thing is to write it down. One line, "fish 4500",
 * Enter. Names used before are buttons. × takes a line off, Undo puts it back. Today's list
 * (5 am to 5 am) with its total; Close the day expects that much less cash. Anyone may open it;
 * writing takes a manager's or the owner's PIN once per visit (the server checks the role too).
 */

const DAY_MS = 24 * 60 * 60_000;
const timeOf = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

export function CashOut({ onBack, nav = true }: {
  onBack: () => void;
  /** The owner's and managers' header (Owner, Menu, Cash out, ...). A cashier gets the shop's name and Register only. */
  nav?: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeEvents(() => setTick((t) => t + 1)), []);
  const { day, names, from } = useMemo(() => {
    const events = readAll();
    const start = businessDayStart(Date.now());
    return { day: cashOutsBetween(events, start, start + DAY_MS), names: namesByUse(events), from: start };
  }, [tick]);

  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const [by, setBy] = useState<Actor | null>(() => (canManage(currentCashier()) ? currentCashier() : null));
  const [pending, setPending] = useState<((actor: Actor) => void) | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; undo: () => void } | null>(null);

  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement && e.target.value) return; // the field clears itself first
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onBack]);

  /** Writes as the manager or owner on hand, or asks for one's PIN first (once per visit). */
  const asManager = (run: (actor: Actor) => void) => {
    if (by) run(by);
    else setPending(() => run);
  };
  const undoOf = (eventId: string, actor: Actor) => () =>
    appendEvent({ type: 'cash.out_undone', at: Date.now(), actor, orderNumber: 0, undoneEventId: eventId });

  const add = () => {
    const line = parseCashOut(text);
    if (!line) {
      setError(text.trim() ? 'Type a name and an amount, like fish 4500.' : 'Type who or what it was for, and how much.');
      field.current?.focus();
      return;
    }
    asManager((actor) => {
      const e = appendEvent({ type: 'cash.out', at: Date.now(), actor, orderNumber: 0, name: line.name, amount: line.amount });
      setText('');
      setError('');
      setToast({ id: Date.now(), message: `${line.name} ${fmt(line.amount)} added`, undo: undoOf(e.id, actor) });
      field.current?.focus();
    });
  };
  const takeOff = (id: string, name: string, amount: number) => asManager((actor) => {
    const off = appendEvent({ type: 'cash.out_undone', at: Date.now(), actor, orderNumber: 0, undoneEventId: id });
    setToast({ id: Date.now(), message: `${name} ${fmt(amount)} taken off`, undo: undoOf(off.id, actor) });
    field.current?.focus();
  });

  const count = day.lines.length;
  return (
    <div className="owner">
      {nav ? <OwnerNav current="cashout" onRegister={onBack} /> : (
        <header className="owner__head">
          <ShopBrand />
          <button type="button" className="owner__back" onClick={onBack}>Register</button>
        </header>
      )}
      <main className="owner__main cashout" aria-label="Cash out">
        <div className="cashout__head">
          <h1 className="menuv__title">Cash out</h1>
          <span className="cashout__day">{new Date(from).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>

        <form className="cashout__entry" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input
            ref={field} value={text} maxLength={MAX_NAME + 20} placeholder="fish 4500" aria-label="Name and amount"
            aria-invalid={error ? true : undefined} autoComplete="off" spellCheck={false}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Escape' && text) { e.preventDefault(); setText(''); setError(''); } }}
          />
          <button type="submit" className="cta cashout__add">Add <kbd>Enter</kbd></button>
        </form>
        {error && <p className="setup__error cashout__error" role="alert">{error}</p>}
        {names.length > 0 && (
          <div className="cashout__names" role="group" aria-label="Names used before">
            {names.map((n) => (
              <button key={n} type="button" className="pill cashout__name"
                onClick={() => { setText(`${n} `); setError(''); field.current?.focus(); }}>{n}</button>
            ))}
          </div>
        )}

        <section aria-label="Cash out today">
          <ul className="cashout__list">
            {count === 0 && <li className="cashout__empty">Nothing yet today. Type a name and an amount above, like on the paper.</li>}
            {day.lines.map((l) => (
              <li key={l.id} className="cashout__row">
                <span className="cashout__what"><b>{l.name}</b><span>{timeOf(l.at)}</span></span>
                <span className="num cashout__amount">{fmt(l.amount)}</span>
                <button type="button" className="cashout__off" aria-label={`Take off ${l.name} ${fmt(l.amount)}`} onClick={() => takeOff(l.id, l.name, l.amount)}>×</button>
              </li>
            ))}
          </ul>
          <p className="cashout__total">
            <span>{count} {count === 1 ? 'item' : 'items'}</span>
            <b className="num">Rs {fmt(day.total)}</b>
          </p>
        </section>
      </main>
      {toast && !pending && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => { toast.undo(); setToast(null); field.current?.focus(); }}>Undo</button>
        </div>
      )}
      {pending && (
        <PinSheet
          purpose="The owner or a manager writes cash out"
          onClose={() => { setPending(null); field.current?.focus(); }}
          onUnlock={(manager) => { setBy(manager); const run = pending; setPending(null); run(manager); }}
        />
      )}
    </div>
  );
}
