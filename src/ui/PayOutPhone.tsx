import { useEffect, useMemo, useState } from 'react';
import { businessDayStart } from '../domain/cashUp.ts';
import { fmt, parseLKR } from '../domain/money.ts';
import { owedLong, paidOutBetween, payment, suppliersFrom, waited, type Supplier } from '../domain/supplies.ts';
import type { SyncEvent } from '../domain/sync.ts';
import { recordFromPhone } from '../services/phonePayOut.ts';

/**
 * Pay out on the owner's phone (behind the Owner view's Pay out box). Serves the owner away
 * from the shop who has just paid a supplier from the bank, or got a bill: they know who and
 * how much; the single next thing is to note it. Who is owed (longest first), a tap opens one
 * amount and two keys: Paid by bank, or Add bill. It counts at once and reaches the shop PC
 * through the cloud (src/services/phonePayOut.ts); Undo is right there.
 */
export function PayOutSheet({ events, now, waiting, onClose }: {
  events: readonly SyncEvent[];
  now: number;
  /** How many of this phone's entries the shop PC has not sent back yet. */
  waiting: number;
  onClose: () => void;
}) {
  const suppliers = useMemo(() => suppliersFrom(events), [events]);
  const today = useMemo(() => paidOutBetween(events, businessDayStart(now), businessDayStart(now) + 24 * 60 * 60_000), [events, now]);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; id: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet owner-sheet" role="dialog" aria-modal="true" aria-label="Pay out">
        <div className="sheet__body">
          <div className="sheet__title">
            <h1>Pay out</h1>
            <button type="button" className="linkbtn" onClick={onClose} autoFocus>Close</button>
          </div>
          {done && (
            <p className="payoutsheet__done" role="status">
              <span>{done.message}</span>
              <button type="button" className="insight__action" onClick={() => {
                recordFromPhone({ type: 'supply.undone', undoneEventId: done.id });
                setDone(null);
              }}>Undo</button>
            </p>
          )}
          {waiting > 0 && (
            <p className="owner__note payoutsheet__waiting">
              {waiting === 1 ? '1 entry is' : `${waiting} entries are`} on the way to the shop PC. It counts here already.
            </p>
          )}
          <ul className="owner-list" aria-label="Suppliers">
            {suppliers.map((s) => (
              <li key={s.id} className="payoutsheet__item">
                <button type="button" className="pastdays__day" aria-expanded={picked === s.id} onClick={() => setPicked(picked === s.id ? null : s.id)}>
                  <span className="owner-list__main">
                    <span>{s.name}</span>
                    <span className={`owner-list__sub${owedLong(s.owedSince, now) ? ' payout__long' : ''}`}>
                      {s.owedSince !== null ? `Owed · ${waited(s.owedSince, now)}` : 'Nothing owed'}
                    </span>
                  </span>
                  {s.owed > 0 && <span className="owner-list__amount num">{fmt(s.owed)}</span>}
                </button>
                {picked === s.id && (
                  <PhoneEntryForm supplier={s} onDone={(message, id) => { setPicked(null); setDone({ message, id }); }} />
                )}
              </li>
            ))}
          </ul>
          {suppliers.length === 0 && <p className="owner__note">Suppliers are added at the counter (Pay out, F7).</p>}
          {today.to.length > 0 && (
            <section aria-label="Paid today">
              <h2 className="pastdays__head">Paid today</h2>
              <ul className="owner-list">
                {today.to.map((p, i) => (
                  <li key={i}>
                    <span className="owner-list__main">
                      <span>{p.name}</span>
                      <span className="owner-list__sub">{p.from === 'bank' ? 'Bank' : 'Drawer'}</span>
                    </span>
                    <span className="owner-list__amount num">{fmt(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** One amount: Paid by bank (all owed when empty) or Add bill (the last bill when empty). */
function PhoneEntryForm({ supplier, onDone }: { supplier: Supplier; onDone: (message: string, id: string) => void }) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const typed = text.trim() ? parseLKR(text) : null;
  const bad = text.trim() !== '' && (typed === null || typed <= 0);
  const payAmount = typed ?? (text.trim() ? null : supplier.owed || null);
  const billAmount = typed ?? (text.trim() ? null : supplier.lastBill);

  const pay = () => {
    if (bad || !payAmount) { setHint('Type the amount you paid.'); return; }
    const id = recordFromPhone({ type: 'supply.paid', supplierId: supplier.id, from: 'bank', ...payment(supplier.owed, payAmount) });
    onDone(`Paid ${supplier.name} Rs ${fmt(payAmount)} by bank`, id);
  };
  const bill = () => {
    if (bad || !billAmount) { setHint('Type the amount on the bill.'); return; }
    const id = recordFromPhone({ type: 'supply.billed', supplierId: supplier.id, amount: billAmount });
    onDone(`Bill from ${supplier.name}: Rs ${fmt(billAmount)}`, id);
  };

  return (
    <div className="payoutsheet__form">
      <label className="setup__field"><span>Amount</span>
        <input
          autoFocus className="num" inputMode="decimal" value={text} aria-invalid={bad || undefined}
          placeholder={supplier.owed ? fmt(supplier.owed) : supplier.lastBill ? fmt(supplier.lastBill) : '0'}
          onChange={(e) => { setText(e.target.value); setHint(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pay(); } }}
        />
      </label>
      {(bad || hint) && <p className="setup__error" role="alert">{bad ? 'Whole rupees, like 12500.' : hint}</p>}
      <div className="payout__keys">
        <button type="button" className="cta payout__key" onClick={pay}>Paid by bank{payAmount ? ` ${fmt(payAmount)}` : ''}</button>
        <button type="button" className="insight__action payout__key" onClick={bill}>Add bill{billAmount ? ` ${fmt(billAmount)}` : ''}</button>
      </div>
    </div>
  );
}
