import { useState } from 'react';
import { kitchenScreenOn, setKitchenScreen } from './kitchenScreen.ts';
import { setSoundOn, soundOn } from './sound.ts';
import { setTheme, themeChoice, type ThemeChoice } from './theme.ts';

const LOOKS: { id: ThemeChoice; label: string }[] = [
  { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'auto', label: 'Follow Windows' },
];

/** Two or three choices, as Settings shows them (the printer's list); the one in use is checked. */
function Choice<T extends string | boolean>({ label, help, options, value, onPick }: {
  label: string; help?: string; options: { id: T; label: string }[]; value: T; onPick: (v: T) => void;
}) {
  return (
    <div>
      <span className="setup__label">{label}</span>
      <div className="setup__choices" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} className="setup__choice" onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {help && <p className="setup__hint">{help}</p>}
    </div>
  );
}

/**
 * Settings › This counter: what only this screen needs (it is kept on this PC, not the shop's).
 * Once in manager mode's command list, which the counter no longer has (owner, 2026-11-25).
 */
export function CounterTab() {
  const [kitchen, setKitchen] = useState(kitchenScreenOn);
  const [look, setLook] = useState(themeChoice);
  const [sound, setSound] = useState(soundOn);
  return (
    <div className="setup__form">
      <p className="setup__lead">For this screen only.</p>
      <Choice label="Kitchen screen" value={kitchen}
        help="Shown: the Register has Send to kitchen and the Kitchen key. Hidden: paying sends the order with it."
        options={[{ id: false, label: 'Hidden' }, { id: true, label: 'Shown' }]}
        onPick={(on) => { setKitchenScreen(on); setKitchen(on); }} />
      <Choice label="Look" value={look} options={LOOKS} onPick={(t) => { setTheme(t); setLook(t); }} />
      <Choice label="Sound" value={sound}
        options={[{ id: true, label: 'On' }, { id: false, label: 'Off' }]}
        onPick={(on) => { setSoundOn(on); setSound(on); }} />
    </div>
  );
}
