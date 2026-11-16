import { itemById } from './menu.ts';
import { fmt } from './money.ts';
import { discountLabel, lineAdjustment, lineGross, totals } from './totals.ts';
import type { Order, PaidOrder, Tender } from './types.ts';
import { lineItemName } from './halves.ts';

/**
 * The customer receipt for the Xprinter XP-80T (80 mm, ESC/POS), in two
 * steps, both pure: `receipt()` lays the paper out as text lines, `escpos()`
 * turns them into the printer's bytes. The same lines feed the on-screen
 * preview, so what the owner approves is what prints.
 * The kitchen never gets paper (CLAUDE.md): this is the customer's receipt only.
 */

/** Font A on 80 mm paper: 48 characters a line (24 when printed double width). */
export const RECEIPT_WIDTH = 48;

/** Receipt paper the shop's printer takes (Shop setup → Printer). Many small printers take 58 mm. */
export type PaperWidth = 58 | 80;
/** Characters a line in Font A: 48 on 80 mm, 32 on 58 mm. */
export const PAPER_CHARS: Record<PaperWidth, number> = { 80: 48, 58: 32 };
/** Dots across the printable width at 203 dpi: 72 mm on 80 mm paper, 48 mm on 58 mm. */
export const PAPER_DOTS: Record<PaperWidth, number> = { 80: 576, 58: 384 };

/**
 * A black-and-white picture the printer draws dot by dot (the shop's logo): 1 bit a dot, rows top to
 * bottom, 1 = black, leftmost dot in the high bit (ESC/POS GS v 0), base64.
 */
export interface Dots { width: number; height: number; bits: string }

/** The shop's own header and footer, from its setup (src/services/shop.ts). */
export interface ShopHeader {
  name: string;
  /** Lines under the name. Only what the owner has confirmed; phone etc. come from the owner. */
  lines: string[];
  /** Empty: no footer line. */
  footer: string;
  /** The shop's logo as printer dots (logoDots.ts), printed above the name; absent = the name alone. */
  logo?: Dots;
}

export interface ReceiptLine {
  text: string;
  center?: boolean;
  bold?: boolean;
  /** Double width and height: the shop name and the total. Half as many characters fit. */
  big?: boolean;
  /** Print this picture instead of the text (the logo); the text stays for plain-text views. */
  image?: Dots;
  /** White on black, the whole line: a band ("MADE FRESH IN 9 MIN"). */
  invert?: boolean;
}

const TENDER_LABEL: Record<Tender, string> = {
  cash: 'Cash', transfer: 'Bank transfer', card: 'Card', qr: 'QR', comp: 'Free',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');
/** "12 Oct 2026 19:42", in the device's local time. */
export const receiptTime = (at: number): string => {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Left text and right text on one line; the left side is cut short rather than pushing the amount off. */
export const twoCols = (left: string, right: string, width = RECEIPT_WIDTH): string => {
  const room = width - right.length - 1;
  const l = left.length > room ? left.slice(0, room) : left;
  return l + ' '.repeat(width - l.length - right.length) + right;
};

/** Wraps on spaces; a word longer than the line is split. */
export const wrap = (text: string, width: number): string[] => {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > width) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, width)); w = w.slice(width); }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
};

const rule = (width: number): ReceiptLine => ({ text: '-'.repeat(width) });
const minus = (cents: number) => `-${fmt(cents)}`;

export function receipt(
  paid: PaidOrder,
  opts: {
    cashier: string; shop: ShopHeader; width?: number; copy?: boolean;
    /** Minutes the kitchen took, Send to Done (billExtras.ts madeInMinutes); absent when not made yet. */
    madeIn?: number | null;
  },
): ReceiptLine[] {
  const { cashier, shop, width = RECEIPT_WIDTH, copy = false, madeIn = null } = opts;
  const out: ReceiptLine[] = [
    ...(shop.logo ? [{ text: shop.name, center: true, image: shop.logo }] : []),
    // Double width: half as many characters fit, so a long name goes on two lines rather than off the paper.
    ...wrap(shop.name, Math.floor(width / 2)).map((text) => ({ text, center: true, bold: true, big: true })),
    ...shop.lines.flatMap((line) => wrap(line, width)).map((text) => ({ text, center: true })),
    // A reprint says so, so one sale can never look like two.
    ...(copy ? [{ text: 'COPY', center: true, bold: true }] : []),
    rule(width),
    { text: twoCols(`Order ${paid.number}`, receiptTime(paid.paidAt), width) },
    { text: `Cashier: ${cashier}` },
    ...(paid.online ? [{ text: 'Online order: collected' }] : []),
    rule(width),
  ];

  out.push(...billBody(paid, width));
  out.push({ text: twoCols('TOTAL', `Rs ${fmt(paid.total)}`, width / 2), bold: true, big: true });
  if (paid.tender === 'cash') {
    out.push({ text: twoCols('Cash', fmt(paid.tendered), width) });
    out.push({ text: twoCols('Change', fmt(paid.change), width), bold: true });
  } else if (paid.tender !== 'comp') { // Free already has its own line above
    out.push({ text: twoCols('Paid by', TENDER_LABEL[paid.tender], width) });
  }
  out.push(rule(width));
  // How fast the kitchen made it, when it has: something people notice (and tell others).
  if (madeIn) out.push({ text: `MADE FRESH IN ${madeIn} MIN`, center: true, bold: true, invert: true }, rule(width));
  for (const text of wrap(shop.footer, width)) out.push({ text, center: true });
  return out;
}

/**
 * What was bought, as it stands: each item and its price, its paid extras, any price adjustment,
 * then a rule and whatever brought the prices down to the total. The TOTAL line is the caller's
 * (a changed bill totals differently).
 */
export const billBody = (order: Order, width = RECEIPT_WIDTH): ReceiptLine[] => {
  const t = totals(order);
  const out: ReceiptLine[] = [];
  for (const l of order.lines) {
    const item = itemById(l.itemId);
    const size = item.variants?.find((v) => v.id === l.size)?.label;
    const name = `${l.qty} x ${lineItemName(l).replace(/½/g, '1/2')}${size ? ` ${size}` : ''}`; // the printer has no ½
    const [first, ...rest] = wrap(name, width - 12);
    out.push({ text: twoCols(first, fmt(lineGross(l)), width) });
    rest.forEach((text) => out.push({ text: `    ${text}` }));
    // Paid extras explain the price; leave-outs and notes are for the kitchen, not the receipt.
    for (const id of l.adds) {
      const label = item.adds.find((o) => o.id === id)?.label;
      if (label) out.push({ text: `    + ${label}` });
    }
    const adj = lineAdjustment(order, l);
    if (adj > 0) out.push({ text: twoCols('    Price adjusted', minus(adj), width) });
  }
  out.push(rule(width));
  if (t.lineAdjust > 0 || t.orderDiscount > 0) out.push({ text: twoCols('Subtotal', fmt(t.subtotal - t.lineAdjust), width) });
  const d = order.adjust?.discount;
  if (d && t.orderDiscount > 0) out.push({ text: twoCols(discountLabel(d), minus(t.orderDiscount), width) });
  return out;
};

/** Plain text, for the preview and dry-run files. Big lines are shown at half width, as on paper. */
export const receiptText = (lines: ReceiptLine[], width = RECEIPT_WIDTH): string =>
  lines.map((l) => {
    const text = l.big ? l.text.split('').join(' ') : l.text;
    return l.center ? ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text : text;
  }).join('\n');

// ----- ESC/POS -----

const ESC = 0x1b;
const GS = 0x1d;
export const CMD = {
  init: [ESC, 0x40],
  /** Cash drawer on the printer's RJ11 port, pin 2: 50 ms on, 500 ms off. */
  kick: [ESC, 0x70, 0x00, 0x19, 0xfa],
  left: [ESC, 0x61, 0x00],
  center: [ESC, 0x61, 0x01],
  boldOn: [ESC, 0x45, 0x01],
  boldOff: [ESC, 0x45, 0x00],
  big: [GS, 0x21, 0x11],
  normal: [GS, 0x21, 0x00],
  invertOn: [GS, 0x42, 0x01],
  invertOff: [GS, 0x42, 0x00],
  /** Feed 4 lines past the tear bar, then a partial cut. */
  feedCut: [GS, 0x56, 0x42, 0x04],
} as const;

/** Sinhala and Tamil script (with the joiners Sinhala uses): the printer's code page has neither. */
const LOCAL_SCRIPT = /\s*[·•-]?\s*[\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]+(?:\s+[\u0B80-\u0BFF\u0D80-\u0DFF\u200C\u200D]+)*/g;

/**
 * The printer's default code page is ASCII-safe; Sinhala or Tamil words are left off ("Bata Kade · බටකඩේ"
 * prints "Bata Kade"), and anything else becomes '?' rather than garbage.
 */
const ascii = (s: string): number[] =>
  [...s.replace(LOCAL_SCRIPT, '').replace(/×/g, 'x').replace(/[·•]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')]
    .map((c) => { const n = c.charCodeAt(0); return n >= 0x20 && n < 0x7f ? n : 0x3f; });

/**
 * Printer bytes for a receipt. The drawer (cash only) opens first, so the
 * cashier can count change while the paper prints.
 */
export const escpos = (lines: ReceiptLine[], { openDrawer = false } = {}): Uint8Array => {
  const out: number[] = [...CMD.init];
  if (openDrawer) out.push(...CMD.kick);
  for (const l of lines) {
    out.push(...(l.center ? CMD.center : CMD.left));
    if (l.image) { out.push(...rasterBytes(l.image)); continue; }
    if (l.bold) out.push(...CMD.boldOn);
    if (l.big) out.push(...CMD.big);
    if (l.invert) out.push(...CMD.invertOn);
    out.push(...ascii(l.text), 0x0a);
    if (l.invert) out.push(...CMD.invertOff);
    if (l.big) out.push(...CMD.normal);
    if (l.bold) out.push(...CMD.boldOff);
  }
  out.push(...CMD.left, ...CMD.feedCut);
  return Uint8Array.from(out);
};

/**
 * A picture as raster bit-image commands (GS v 0), in bands of 64 rows: some printers drop a
 * picture sent as one tall block.
 */
export const rasterBytes = ({ width, height, bits }: Dots): number[] => {
  const raw = atob(bits);
  const row = Math.ceil(width / 8);
  const out: number[] = [];
  for (let y = 0; y < height; y += 64) {
    const h = Math.min(64, height - y);
    out.push(GS, 0x76, 0x30, 0x00, row & 0xff, row >> 8, h & 0xff, h >> 8);
    for (let i = y * row; i < (y + h) * row; i++) out.push(raw.charCodeAt(i));
  }
  return out;
};

/**
 * A picture's pixels (RGBA, as a canvas gives them) as printer dots: transparent counts as paper,
 * darker than `threshold` is ink, and blank rows above and below are cut so no paper is wasted.
 * Logos are flat colours, so a plain threshold prints crisper than dithering.
 */
export const toDots = (rgba: ArrayLike<number>, width: number, height: number, threshold = 160): Dots | null => {
  const ink = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    const a = rgba[p + 3] / 255;
    const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) * a + 255 * (1 - a);
    return lum < threshold;
  };
  const rows: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (ink(x, y)) { rows.push(y); break; }
  if (!rows.length) return null;
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const h = bottom - top + 1;
  const row = Math.ceil(width / 8);
  const bytes = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) if (ink(x, y + top)) bytes[y * row + (x >> 3)] |= 0x80 >> (x & 7);
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return { width, height: h, bits: btoa(s) };
};

/** Opens the cash drawer and nothing else: no paper (Shop setup → Printer → "Open the cash drawer"). */
export const drawerOnly = (): Uint8Array => Uint8Array.from([...CMD.init, ...CMD.kick]);

/** Cash in the drawer changes only for cash; everything else prints without opening it. */
export const opensDrawer = (paid: PaidOrder): boolean => paid.tender === 'cash';
