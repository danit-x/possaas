import { drawerOnly, escpos, opensDrawer, receipt, type ReceiptLine } from '../domain/receipt.ts';
import type { PaidOrder } from '../domain/types.ts';
import { syncToken } from './pairing.ts';
import { receiptWidth, shopDetails, shopHeader, shopLogo } from './shop.ts';
import { logoDots } from './logoDots.ts';
import { madeInMinutes } from '../domain/madeIn.ts';
import { readAll } from '../ui/eventLog.ts';
import type { ShopHeader } from '../domain/receipt.ts';

/**
 * Prints the customer receipt through the server on the counter PC, which
 * hands the bytes to the XP-80T (server/printer.ts). The bytes are built
 * here, from the same pure layout the preview shows.
 *
 * 'unavailable': this device is not paired with the server (development, the
 * demo), so there is nothing to print to and the screen offers no printing.
 */
export type PrintResult = 'printed' | 'failed' | 'unavailable';

export const canPrint = (): boolean => syncToken() !== null;

const base64 = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
};

/**
 * At payment the cash drawer opens with the receipt (cash only). A reprint
 * never opens the drawer and is marked COPY.
 */
export async function printReceipt(paid: PaidOrder, cashier: string, { reprint = false } = {}): Promise<PrintResult> {
  const madeIn = madeInMinutes(readAll(), paid.number, Date.now());
  return send(escpos(receipt(paid, { shop: await printedHeader(), cashier, copy: reprint, width: receiptWidth(), madeIn }), { openDrawer: !reprint && opensDrawer(paid) }));
}

/** The shop's header with its logo as printer dots, when it has one (Shop setup). */
export const printedHeader = async (): Promise<ShopHeader> => {
  const logo = await logoDots(shopLogo(), shopDetails()?.paper ?? 80);
  return { ...shopHeader(), ...(logo ? { logo } : {}) };
};

/** Any lines on the receipt printer (the day's close), without opening the drawer. */
export const printLines = (lines: ReceiptLine[]): Promise<PrintResult> => send(escpos(lines));

/** Shop setup → Printer: opens the cash drawer (plugged into the printer) without printing anything. */
export const openDrawer = (): Promise<PrintResult> => send(drawerOnly());

async function send(bytes: Uint8Array): Promise<PrintResult> {
  const token = syncToken();
  if (!token) return 'unavailable';
  try {
    const r = await fetch('/api/v1/print', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ data: base64(bytes) }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? 'printed' : 'failed';
  } catch {
    return 'failed';
  }
}
