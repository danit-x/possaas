import { useEffect, useRef, useState } from 'react';
import { features } from '../domain/features.ts';
import { receipt, type Dots, type ShopHeader } from '../domain/receipt.ts';
import { totals } from '../domain/totals.ts';
import type { Order, PaidOrder } from '../domain/types.ts';
import { canPrint, printReceipt, printedHeader } from '../services/printer.ts';
import { receiptWidth, shopDetails, shopHeader } from '../services/shop.ts';

/**
 * /#receipt: the customer receipt as the XP-80T will print it, for the owner
 * to approve and for setting up the printer (CLAUDE.md, SCRUM-71). Not part of
 * the cashier's screens. Built from the same lines that become the printer's
 * bytes, so the paper matches this page.
 */
const SAMPLE: Order = {
  number: 1043,
  lines: [
    { id: 'a', itemId: 'margherita', qty: 2, size: 'M', adds: ['full-cheese'], outs: [] },
    { id: 'b', itemId: 'devilled-chicken', qty: 1, size: 'L', adds: [], outs: [] },
    { id: 'c', itemId: 'crispy-chicken-burger', qty: 1, adds: [], outs: [] },
  ],
  adjust: { discount: { kind: 'percent', pct: 10 } },
};

export const samplePaid = (): PaidOrder => {
  const total = totals(SAMPLE).total;
  return { ...SAMPLE, total, tender: 'cash', tendered: 1000000, change: 1000000 - total, paidAt: Date.now() };
};

/** A picture drawn from the very dots the printer gets (the logo), so the preview shows the paper. */
function PaperDots({ dots, label }: { dots: Dots; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const raw = atob(dots.bits);
    const row = Math.ceil(dots.width / 8);
    const img = ctx.createImageData(dots.width, dots.height);
    for (let y = 0; y < dots.height; y++) {
      for (let x = 0; x < dots.width; x++) {
        const on = (raw.charCodeAt(y * row + (x >> 3)) >> (7 - (x & 7))) & 1;
        const p = (y * dots.width + x) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = on ? 17 : 255;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [dots]);
  // On paper the dots are 1/8 mm: shown at their share of the line, as they print.
  const share = `${(dots.width / (receiptWidth() === 32 ? 384 : 576)) * 100}%`;
  return <canvas ref={ref} className="paper__image" style={{ width: share }} width={dots.width} height={dots.height} role="img" aria-label={label} />;
}

export function ReceiptPreview() {
  const [paid] = useState(samplePaid);
  const [test, setTest] = useState<'idle' | 'printing' | 'printed' | 'failed'>('idle');
  const width = receiptWidth();
  // The logo as dots is made in the browser (logoDots.ts); the name alone until it is ready.
  const [shop, setShop] = useState<ShopHeader>(shopHeader);
  useEffect(() => { void printedHeader().then(setShop); }, []);
  // A sample made in 9 minutes, to show where that band goes; a shop without the kitchen never prints it.
  const lines = receipt(paid, { shop, cashier: 'Nimal', width, madeIn: features().kitchen ? 9 : null });

  const printTest = async () => {
    setTest('printing');
    // As a reprint: marked COPY, and the cash drawer stays shut.
    const r = await printReceipt(paid, 'Nimal', { reprint: true });
    setTest(r === 'printed' ? 'printed' : 'failed');
  };

  return (
    <main className="rpreview">
      <header className="rpreview__head">
        <h1>Customer receipt</h1>
        <p>{shopDetails()?.paper ?? 80} mm paper, {width} characters a line. A sample sale, as it prints.</p>
        {canPrint() && (
          <p className="rpreview__actions">
            <button type="button" className="chip" onClick={() => void printTest()} disabled={test === 'printing'}>
              Print a test receipt
            </button>
            <span role="status">
              {test === 'printed' && 'Sent to the printer'}
              {test === 'failed' && 'The printer did not take it'}
            </span>
          </p>
        )}
      </header>
      <figure className="paper" aria-label="Receipt preview" style={{ '--chars': width } as React.CSSProperties}>
        {lines.map((l, i) => (
          <div key={i} className={`paper__line${l.big ? ' paper__line--big' : ''}${l.bold ? ' paper__line--bold' : ''}${l.invert ? ' paper__line--invert' : ''}`}
            style={{ textAlign: l.center ? 'center' : 'left' }}>
            {l.image ? <PaperDots dots={l.image} label={`${l.text} logo`} /> : (l.text || ' ')}
          </div>
        ))}
      </figure>
    </main>
  );
}
