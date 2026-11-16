import { PAPER_DOTS, toDots, type Dots, type PaperWidth } from '../domain/receipt.ts';

/**
 * The shop's logo (Shop setup, a small data: URL) as printer dots, made in the browser, so no shop's
 * picture is ever built into the app. Two thirds of the printable width (256 dots on 58 mm), never
 * wider than the picture itself, so a small logo is not blown up blurry. Made once per logo and paper.
 */
const made = new Map<string, Promise<Dots | null>>();

export const logoDots = (url: string, paper: PaperWidth): Promise<Dots | null> => {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  const key = `${paper}:${url}`;
  let p = made.get(key);
  if (!p) {
    p = new Promise<Dots | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const target = Math.min(Math.round((PAPER_DOTS[paper] * 2) / 3), Math.max(img.naturalWidth, 8));
        const width = target - (target % 8); // whole bytes a row
        const height = Math.max(1, Math.round((img.naturalHeight * width) / img.naturalWidth));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, width, height);
        try { resolve(toDots(ctx.getImageData(0, 0, width, height).data, width, height)); } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    made.set(key, p);
  }
  return p;
};
