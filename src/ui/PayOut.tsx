import { useEffect, useMemo, useRef, useState } from 'react';
import { canManage, type Actor } from '../domain/auth.ts';
import { fmt, parseLKR } from '../domain/money.ts';
import { newLineId } from '../domain/order.ts';
import { owedLong, payment, suppliersFrom, waited, type PaidFrom, type Supplier } from '../domain/supplies.ts';
import { currentCashier } from '../services/auth.ts';
import { ShopBrand } from './Brand.tsx';
import { appendEvent, readAll, subscribeEvents } from './eventLog.ts';
import { OwnerNav } from './OwnerNav.tsx';
import { PinSheet } from './PinSheet.tsx';

/**
 * Pay out (#payout, F7 on the Register). Serves the manager at the counter when goods come in
 * or a supplier wants paying. They know who is at the door and what the bill says; the single
 * next thing is to note the bill, or pay. Suppliers on the left (whoever has waited longest on
 * top), the chosen one on the right: one amount, two keys. A payment from the drawer comes off
 * the cash Close the day expects. Anyone may open it; a bill or a payment takes a manager's PIN
 * once per visit (the server checks the role too).
 */

const when = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const FROM_NAMES: Record<PaidFrom, string> = { drawer: 'Drawer', bank: 'Bank' };

type Pending = { run: (by: Actor) => void };

export function PayOut({ onBack, nav = true }: {
  onBack: () => void;
  /** The owner's and managers' header (Owner, Menu, Pay out, …). A cashier gets the shop's name and Register only. */
  nav?: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeEvents(() => setTick((t) => t + 1)), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [tick]);
  const suppliers = useMemo(() => suppliersFrom(readAll()), [tick]);

  const [picked, setPicked] = useState<string | null>(null);
  const supplier = suppliers.find((s) => s.id === picked) ?? (picked === 'new' ? null : suppliers[0] ?? null);
  const adding = picked === 'new' || suppliers.length === 0;
  const [by, setBy] = useState<Actor | null>(() => (canManage(currentCashier()) ? currentCashier() : null));
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; undo: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Runs as the manager on hand, or asks for one's PIN first (once per visit). */
  const asManager = (run: (by: Actor) => void) => {
    if (by) run(by);
    else setPending({ run });
  };

  const undoable = (message: string, eventId: string, actor: Actor) => setToast({
    id: Date.now(), message,
    undo: () => appendEvent({ type: 'supply.undone', at: Date.now(), actor, orderNumber: 0, undoneEventId: eventId }),
  });

  const addSupplier = (name: string) => asManager((actor) => {
    const supplierId = newLineId();
    const e = appendEvent({ type: 'supply.supplier_set', at: Date.now(), actor, orderNumber: 0, supplierId, name });
    setPicked(supplierId);
    undoable(`${name} added`, e.id, actor);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement && e.target.value) return; // the field clears itself first
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onBack]);

  /** ↑ ↓ walk the list, from anywhere on the screen (the amount field too). */
  const step = (by: number) => {
    if (!suppliers.length) return;
    const i = supplier ? suppliers.indexOf(supplier) : -1;
    setPicked(suppliers[Math.max(0, Math.min(suppliers.length - 1, i + by))].id);
  };

  return (
    <div className="owner">
      {nav ? <OwnerNav current="payout" onRegister={onBack} /> : (
        <header className="owner__head">
          <ShopBrand />
          <button type="button" className="owner__back" onClick={onBack}>Register</button>
        </header>
      )}
      <main className="owner__main payout" aria-label="Pay out">
        <h1 className="menuv__title">Pay out</h1>
        <div className="payout__grid">
          <ul className="payout__list" aria-label="Suppliers">
            {suppliers.map((s) => (
              <li key={s.id}>
                <button type="button" className="payout__row" aria-pressed={s.id === supplier?.id && !adding} onClick={() => setPicked(s.id)}>
                  <span className="payout__name">
                    <b>{s.name}</b>
                    {s.owedSince !== null && (
                      <span className={owedLong(s.owedSince, now) ? 'payout__long' : undefined}>{waited(s.owedSince, now)}</span>
                    )}
                  </span>
                  <span className={`num payout__owed${s.owed ? '' : ' payout__owed--none'}`}>{s.owed ? fmt(s.owed) : 'paid'}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="payout__row payout__add" aria-pressed={adding} onClick={() => setPicked('new')}>
                + Supplier or other
              </button>
            </li>
          </ul>
          {adding
            ? <NewSupplier first={suppliers.length === 0} onAdd={addSupplier} onCancel={() => setPicked(null)} />
            : supplier && (
              <Panel
                key={supplier.id} supplier={supplier} now={now} onStep={step}
                onBill={(amount) => asManager((actor) => {
                  const e = appendEvent({ type: 'supply.billed', at: Date.now(), actor, orderNumber: 0, supplierId: supplier.id, amount });
                  undoable(`Bill from ${supplier.name}: Rs ${fmt(amount)}`, e.id, actor);
                })}
                onPay={(amount, from) => asManager((actor) => {
                  const e = appendEvent({ type: 'supply.paid', at: Date.now(), actor, orderNumber: 0, supplierId: supplier.id, from, ...payment(supplier.owed, amount) });
                  undoable(`Paid ${supplier.name} Rs ${fmt(amount)} from the ${from === 'bank' ? 'bank' : 'drawer'}`, e.id, actor);
                })}
              />
            )}
        </div>
      </main>
      {toast && !pending && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>
        </div>
      )}
      {pending && (
        <PinSheet
          purpose="A manager pays out"
          onClose={() => setPending(null)}
          onUnlock={(manager) => { setBy(manager); setPending(null); pending.run(manager); }}
        />
      )}
    </div>
  );
}

/** The chosen supplier: what is owed, one amount, Add bill or Pay. */
function Panel({ supplier, now, onBill, onPay, onStep }: {
  supplier: Supplier;
  now: number;
  onBill: (amount: number) => void;
  onPay: (amount: number, from: PaidFrom) => void;
  onStep: (by: number) => void;
}) {
  const [text, setText] = useState('');
  const [from, setFrom] = useState<PaidFrom>('drawer');
  const [hint, setHint] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.focus(); }, []);

  const typed = text.trim() ? parseLKR(text) : null;
  const bad = text.trim() !== '' && (typed === null || typed <= 0);
  const billAmount = typed ?? (text.trim() ? null : supplier.lastBill);
  const payAmount = typed ?? (text.trim() ? null : supplier.owed || null);

  const done = () => { setText(''); setHint(''); field.current?.focus(); };
  const bill = () => {
    if (bad || !billAmount) { setHint('Type the amount on the bill.'); field.current?.focus(); return; }
    onBill(billAmount); done();
  };
  const pay = () => {
    if (bad || !payAmount) { setHint('Type the amount to pay.'); field.current?.focus(); return; }
    onPay(payAmount, from); done();
  };

  return (
    <section className="payout__panel" aria-label={supplier.name}>
      <h2 className="payout__title">{supplier.name}</h2>
      <p className="payout__due">
        {supplier.owed
          ? <><b className="num">Rs {fmt(supplier.owed)}</b> owed{supplier.owedSince !== null && <span className={owedLong(supplier.owedSince, now) ? 'payout__long' : undefined}> · {waited(supplier.owedSince, now)}</span>}</>
          : 'Nothing owed'}
      </p>
      <label className="setup__field"><span>Amount</span>
        <input
          ref={field} className="num" inputMode="decimal" value={text}
          placeholder={supplier.lastBill ? fmt(supplier.lastBill) : '0'}
          aria-invalid={bad || undefined}
          onChange={(e) => { setText(e.target.value); setHint(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) pay(); else bill(); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); onStep(e.key === 'ArrowDown' ? 1 : -1); }
            if (e.key === 'Escape' && text) { e.preventDefault(); setText(''); setHint(''); }
          }}
        />
      </label>
      {(bad || hint) && <p className="setup__error" role="alert">{bad ? 'Whole rupees, like 12500.' : hint}</p>}
      <div className="payout__keys">
        <button type="button" className="insight__action payout__key" onClick={bill}>
          Add bill{billAmount ? ` ${fmt(billAmount)}` : ''} <kbd>Enter</kbd>
        </button>
        <button type="button" className="cta payout__key" onClick={pay}>
          Pay{payAmount ? ` ${fmt(payAmount)}` : ''} <kbd>Shift Enter</kbd>
        </button>
      </div>
      <div className="payout__from" role="group" aria-label="Paid from">
        {(['drawer', 'bank'] as const).map((f) => (
          <button key={f} type="button" className="pill" aria-pressed={from === f} onClick={() => { setFrom(f); field.current?.focus(); }}>{FROM_NAMES[f]}</button>
        ))}
      </div>
      {supplier.history.length > 0 && (
        <ul className="owner-list payout__history" aria-label="Last bills and payments">
          {supplier.history.slice(0, 6).map((h, i) => (
            <li key={i}>
              <span className="owner-list__main">
                <span>{h.kind === 'bill' ? 'Bill' : `Paid · ${FROM_NAMES[h.from ?? 'drawer'].toLowerCase()}`}</span>
                <span className="owner-list__sub">{when(h.at)}</span>
              </span>
              <span className="owner-list__amount num">{h.kind === 'paid' ? '- ' : ''}{fmt(h.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A supplier, or "other" (ice, a repair): a name is all it takes. */
function NewSupplier({ first, onAdd, onCancel }: { first: boolean; onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [hint, setHint] = useState(false);
  const add = () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) { setHint(true); return; }
    onAdd(n.slice(0, 80));
  };
  return (
    <section className="payout__panel" aria-label="New supplier">
      <h2 className="payout__title">{first ? 'Add your first supplier' : 'New supplier or other'}</h2>
      <p className="payout__due">Whoever you pay: the chicken man, the bakery, gas, or one-offs like ice.</p>
      <label className="setup__field"><span>Name</span>
        <input
          autoFocus value={name} maxLength={80} placeholder="Nimal · chicken"
          onChange={(e) => { setName(e.target.value); setHint(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
            if (e.key === 'Escape' && name) { e.preventDefault(); setName(''); }
          }}
        />
      </label>
      {hint && <p className="setup__error" role="alert">Type a name first.</p>}
      <div className="payout__keys">
        <button type="button" className="cta payout__key" onClick={add}>Add <kbd>Enter</kbd></button>
        {!first && <button type="button" className="insight__action payout__key" onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  );
}
