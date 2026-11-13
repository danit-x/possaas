import { useFeatures } from '../services/shop.ts';
import { ShopBrand } from './Brand.tsx';

/**
 * The one header for the owner's and manager's screens (Owner view, Menu, Cash out, Shop setup):
 * the same links in the same place on every one, the current one marked. No key hints
 * in it, so nothing shifts between screens (F7 and Esc still work where they did).
 */

export type Section = 'owner' | 'menu' | 'cashout' | 'close' | 'setup';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'owner', label: 'Owner' },
  { id: 'menu', label: 'Menu' },
  { id: 'cashout', label: 'Cash out' },
  { id: 'close', label: 'Close the day' },
  { id: 'setup', label: 'Shop setup' },
];

export function OwnerNav({ current, onRegister }: {
  current: Section;
  /** Back to selling. Without it, a plain link to the Register. */
  onRegister?: () => void;
}) {
  const parts = useFeatures();
  return (
    <header className="owner__head">
      <ShopBrand />
      <nav className="owner__nav" aria-label="Owner sections">
        {SECTIONS.filter((s) => s.id !== 'cashout' || parts.cashOut).map((s) => (
          <a key={s.id} href={`#${s.id}`} aria-current={s.id === current ? 'page' : undefined}>{s.label}</a>
        ))}
        {onRegister
          ? <button type="button" className="owner__back" onClick={onRegister}>Register</button>
          : <a href="#">Register</a>}
      </nav>
    </header>
  );
}
