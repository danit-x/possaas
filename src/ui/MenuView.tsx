import { useEffect, useState, type FormEvent } from 'react';
import { MENU, comboEntries, menuItems, menuSections, menuState, sectionById, startingItem } from '../domain/menu.ts';
import { sizeShort, type Section } from '../domain/sections.ts';
import { SectionSheet } from './SectionSheet.tsx';
import { managesRole } from '../domain/auth.ts';
import { comboBlocked, separatePrice } from '../domain/combos.ts';
import { ComboEditor, saveCombo } from './ComboEditor.tsx';
import { checkNewItem, checkOverride, newItemSizes, nextMorning, type ItemOverride, type NewItem } from '../domain/menuEdits.ts';
import { fmt } from '../domain/money.ts';
import type { Category, Cents, Combo, MenuItem, SizeId } from '../domain/types.ts';
import { currentCashier } from '../services/auth.ts';
import { useCostContext } from '../services/inventoryStore.ts';
import { appendEvent } from './eventLog.ts';
import { useMenu } from './menuStore.ts';
import { OwnerNav } from './OwnerNav.tsx';
import { NumberInput } from './NumberInput.tsx';
import { photoChoice, undoChoice } from '../domain/menuPhotos.ts';
import { photoSrc, photoUrl } from '../services/menuPhotos.ts';
import { PhotoSlot } from './PhotoSlot.tsx';

/**
 * The owner's menu (#menu). Serves the owner: they know their menu and want one change made
 * now, a price, a name, something off for today, without calling anyone. The single next
 * thing: find the item, change it, save. Managers see the same list with "Sold out today" only.
 * Every change is an event (who, when, before/after) with an Undo, and reaches the counter and
 * the kitchen at once. Bata Kade (2026-11-25): only its own menu shows, with no stock, recipes or costs.
 */
/** "Add a pizza" for a printed section; "Add to Kottu" for one of his own (SCRUM-241). */
const addWords = (s: Section) => (s.printed ? `Add a ${s.one.toLowerCase()}` : `Add to ${s.label}`);
/** The item as printed, or as the owner added it. */
const startOf = (id: string) => startingItem(id) ?? MENU.find((m) => m.id === id)!;
const prices = (m: MenuItem) => (m.variants ? m.variants.map((v) => `${sizeShort(v)} ${fmt(v.price)}`).join(' · ') : fmt(m.price ?? 0));

/** "1,650" or "1650" → cents, whole rupees only. */
const toCents = (text: string): Cents | null => {
  const t = text.replace(/[,\s]/g, '');
  return /^\d{1,6}$/.test(t) ? Number(t) * 100 : null;
};

const record = (itemId: string, after: ItemOverride) => {
  const before = menuState().overrides[itemId] ?? {};
  appendEvent({ type: 'menu.item_set', at: Date.now(), orderNumber: 0, actor: currentCashier(), itemId, before, after });
  return before;
};
const setSoldOut = (itemId: string, out: boolean) =>
  appendEvent({ type: 'menu.sold_out', at: Date.now(), orderNumber: 0, actor: currentCashier(), itemId, until: out ? nextMorning(Date.now()) : null });
const addItem = (itemId: string, item: NewItem | null) =>
  appendEvent({ type: 'menu.item_added', at: Date.now(), orderNumber: 0, actor: currentCashier(), itemId, item });
/** Gives an item a photo (an id), none (null) or back to never chosen (''); returns what to send for Undo. */
const setPhoto = (itemId: string, photo: string | null): string | null => {
  const was = undoChoice(photoChoice(menuState(), itemId));
  appendEvent({ type: 'menu.photo_set', at: Date.now(), orderNumber: 0, actor: currentCashier(), itemId, photo });
  return was;
};

/** "Chicken Alfredo" → "new-chicken-alfredo", or "new-chicken-alfredo-2" if that was ever used. */
const newId = (en: string): string => {
  const slug = en.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  const taken = new Set(menuItems().map((m) => m.id));
  let id = `new-${slug}`;
  for (let n = 2; taken.has(id); n++) id = `new-${slug}-${n}`;
  return id;
};

/** Typing "pasta" or a name already on the menu must keep finding one item, so names stay unique. */
const nameTaken = (en: string): MenuItem | undefined => {
  const t = en.trim().toLowerCase();
  return menuItems().find((m) => !m.removed && (m.name.en.toLowerCase() === t || m.aliases.includes(t)));
};

/** Escape closes a sheet. */
const useEscape = (onClose: () => void) => useEffect(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [onClose]);

const STEPS = ['Name', 'Price'] as const;
type Step = 0 | 1;

/**
 * Add a dish (SCRUM-129). Serves the owner: what it is, then what he charges. Bata Kade keeps no
 * recipes or stock (2026-11-25), so there is no "what goes in it" step. Nothing is saved until the
 * last step, then the item goes in with one Undo.
 */
function AddDish({ section, onSaved, onClose }: {
  section: Section; onSaved: (message: string, undo: () => void) => void; onClose: () => void;
}) {
  const shape = newItemSizes(section.id, MENU, menuState().sections);
  const [step, setStep] = useState<Step>(0);
  const [en, setEn] = useState('');
  const [si, setSi] = useState('');
  const [ta, setTa] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  /** A photo chosen before Add: it goes with the item. */
  const [photo, setPhotoId] = useState<string | null>(null);
  useEscape(onClose);

  const go = (next: Step) => { setError(''); setStep(next); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 0) {
      const same = nameTaken(en);
      if (same) return setError(`${same.name.en} is already on the menu. Give this one another name.`);
      const bad = en.trim() ? null : 'Type its name in English.';
      return bad ? setError(bad) : go(1);
    }
    const prices: NewItem['prices'] = {};
    for (const s of shape) {
      const c = toCents(price[s.id] ?? '');
      if (c === null || c === 0) return setError(`Type a price for ${s.id === 'one' ? 'it' : s.label}, in whole rupees, like 1650.`);
      prices[s.id] = c;
    }
    const item: NewItem = {
      category: section.id,
      name: { en: en.trim(), ...(si.trim() ? { si: si.trim() } : {}), ...(ta.trim() ? { ta: ta.trim() } : {}) },
      description: desc.trim(),
      prices,
    };
    const bad = checkNewItem(item, MENU, menuState().sections);
    if (bad) return setError(`${bad[0].toUpperCase()}${bad.slice(1)}.`);
    const id = newId(item.name.en);
    addItem(id, item);
    if (photo) setPhoto(id, photo);
    onSaved(`${item.name.en} is on the counter`, () => { if (photo) setPhoto(id, ''); addItem(id, null); });
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="sheet menued" role="dialog" aria-modal="true" aria-label={addWords(section)} onSubmit={submit}>
        <div className="sheet__body">
          <div className="sheet__title"><h1>{step === 0 || !en.trim() ? addWords(section) : en.trim()}</h1></div>
          <ol className="dish__steps" aria-label="Steps">
            {STEPS.map((label, i) => (
              <li key={label} aria-current={i === step ? 'step' : undefined} className={i < step ? 'dish__done' : undefined}>{label}</li>
            ))}
          </ol>

          {step === 0 && (
            <section className="group">
              <div className="menued__grid">
                <label>English<input value={en} onChange={(e) => { setEn(e.target.value); setError(''); }} maxLength={40} autoFocus /></label>
                <label>Sinhala<input value={si} onChange={(e) => setSi(e.target.value)} maxLength={60} lang="si" /></label>
                <label>Tamil<input value={ta} onChange={(e) => setTa(e.target.value)} maxLength={60} lang="ta" /></label>
                <label className="menued__wide">Description<input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={160} /></label>
              </div>
            </section>
          )}
          {step === 0 && (
            <PhotoSlot name={en.trim() || 'the new item'} url={photo ? photoSrc(photo) : null} onPhoto={setPhotoId}
              onRemove={() => setPhotoId(null)} />
          )}

          {step === 1 && (
            <section className="group">
              <div className="menued__grid">
                {shape.map((s, i) => (
                  <label key={s.id}>
                    {s.hint ? `${s.label} ${s.hint}` : s.label}
                    <NumberInput decimals={0} value={price[s.id] ?? ''} autoFocus={i === 0}
                      onText={(text) => { setPrice({ ...price, [s.id]: text }); setError(''); }}
                      aria-label={s.id === 'one' ? 'Price' : `${s.label} price`} />
                  </label>
                ))}
              </div>
              <p className="menued__note">
                {section.printed ? `Extras are the same as on the other ${section.label.toLowerCase()}.` : `Dishes of ${section.label} have no extras.`}
              </p>
            </section>
          )}
          {error && <p className="reason-msg" role="alert">{error}</p>}
        </div>
        <div className="sheet__foot menued__foot">
          <button type="button" className="linkbtn" onClick={step === 0 ? onClose : () => go(0)}>{step === 0 ? 'Cancel' : 'Back'}</button>
          <button type="submit" className="cta">{step === 1 ? 'Add to the menu' : 'Next'}</button>
        </div>
      </form>
    </>
  );
}

function Editor({ item, onSaved, onClose }: { item: MenuItem; onSaved: (message: string, undo: () => void) => void; onClose: () => void }) {
  const base = startOf(item.id);
  const startName = base.added ? 'how you added it' : 'the printed menu';
  const [en, setEn] = useState(item.name.en);
  const [si, setSi] = useState(item.name.si ?? '');
  const [ta, setTa] = useState(item.name.ta ?? '');
  const [desc, setDesc] = useState(item.description);
  const sizes = item.variants?.map((v) => v.id) ?? ['one' as const];
  const [price, setPrice] = useState<Record<string, string>>(() =>
    Object.fromEntries(item.variants ? item.variants.map((v) => [v.id, String(v.price / 100)]) : [['one', String((item.price ?? 0) / 100)]]));
  const [adds, setAdds] = useState<Record<string, string>>(() => Object.fromEntries(item.adds.map((a) => [a.id, String(a.price / 100)])));
  const [hidden, setHidden] = useState(Boolean(item.hidden));
  const [error, setError] = useState('');
  /** A photo change is made at once (not on Save), with its own Undo. */
  const [photoNote, setPhotoNote] = useState<{ message: string; undo: string | null } | null>(null);
  useMenu();

  useEscape(onClose);
  const changePhoto = (photo: string | null, message: string) => setPhotoNote({ message, undo: setPhoto(item.id, photo) });

  const basePrice = (id: string) => (id === 'one' ? base.price ?? 0 : base.variants!.find((v) => v.id === id)!.price);

  /** Only what differs from the printed menu is kept, so "same as printed" is simply nothing. */
  const build = (): ItemOverride | string => {
    const o: ItemOverride = {};
    const name: ItemOverride['name'] = {};
    if (en.trim() !== base.name.en) name.en = en.trim();
    if (si.trim()) name.si = si.trim();
    if (ta.trim()) name.ta = ta.trim();
    if (Object.keys(name).length) o.name = name;
    if (desc.trim() !== base.description) o.description = desc.trim();
    const p: NonNullable<ItemOverride['prices']> = {};
    for (const id of sizes) {
      const c = toCents(price[id] ?? '');
      if (c === null) return 'Prices are whole rupees, like 1650.';
      if (c !== basePrice(id)) p[id as SizeId | 'one'] = c;
    }
    if (Object.keys(p).length) o.prices = p;
    const a: Record<string, Cents> = {};
    for (const opt of base.adds) {
      const c = toCents(adds[opt.id] ?? '');
      if (c === null) return 'Prices are whole rupees, like 300.';
      if (c !== opt.price) a[opt.id] = c;
    }
    if (Object.keys(a).length) o.adds = a;
    if (hidden) o.hidden = true;
    return checkOverride(base, o) ?? o;
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const o = build();
    if (typeof o === 'string') { setError(o); return; }
    const before = record(item.id, o);
    onSaved(`Saved ${en.trim() || base.name.en}`, () => record(item.id, before));
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="sheet menued" role="dialog" aria-modal="true" aria-label={`Change ${item.name.en}`} onSubmit={save}>
        <div className="sheet__body">
          <div className="sheet__title">
            <h1>{item.name.en}</h1>
            {item.edited && (
              <button type="button" className="linkbtn" onClick={() => {
                const before = record(item.id, {});
                onSaved(`${base.name.en}: back to ${startName}`, () => record(item.id, before));
              }}>Back to {startName}</button>
            )}
            {base.added && (
              <button type="button" className="linkbtn" onClick={() => {
                // Only his own dishes go for good; printed ones are hidden instead.
                const { removed: _, ...was } = menuState().added[item.id];
                addItem(item.id, null);
                onSaved(`Deleted ${item.name.en}`, () => addItem(item.id, was));
              }}>Delete</button>
            )}
          </div>

          <PhotoSlot name={item.name.en} url={photoUrl(item.id)}
            onPhoto={(id) => changePhoto(id, 'Photo changed.')} onRemove={() => changePhoto(null, 'Photo removed.')} />
          {photoNote && (
            <p className="menued__added" role="status">
              {photoNote.message}
              <button type="button" className="linkbtn" onClick={() => { setPhoto(item.id, photoNote.undo); setPhotoNote(null); }}>Undo</button>
            </p>
          )}

          <section className="group">
            <h2>Name</h2>
            <div className="menued__grid">
              <label>English<input value={en} onChange={(e) => setEn(e.target.value)} maxLength={40} required /></label>
              <label>Sinhala<input value={si} onChange={(e) => setSi(e.target.value)} maxLength={60} lang="si" /></label>
              <label>Tamil<input value={ta} onChange={(e) => setTa(e.target.value)} maxLength={60} lang="ta" /></label>
              <label className="menued__wide">Description<input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={160} /></label>
            </div>
          </section>

          <section className="group">
            <h2>Price</h2>
            <div className="menued__grid">
              {sizes.map((id) => {
                const v = item.variants?.find((x) => x.id === id);
                const was = basePrice(id);
                return (
                  <label key={id}>
                    {v ? `${v.label}${v.hint ? ` ${v.hint}` : ''}` : 'Price'}
                    <NumberInput decimals={0} value={price[id]} onText={(text) => setPrice({ ...price, [id]: text })} aria-label={v ? `${v.label} price` : 'Price'} />
                    {toCents(price[id]) !== was && <span className="menued__was num">{base.added ? 'Was' : 'Printed'} {fmt(was)}</span>}
                  </label>
                );
              })}
            </div>
          </section>

          {base.adds.length > 0 && (
            <section className="group">
              <h2>Extras</h2>
              <div className="menued__grid">
                {base.adds.map((opt) => (
                  <label key={opt.id}>
                    {opt.label}
                    <NumberInput decimals={0} value={adds[opt.id]} onText={(text) => setAdds({ ...adds, [opt.id]: text })} aria-label={`${opt.label} price`} />
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="group">
            <label className="menued__check">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              Hide from the menu <span>(the counter stops offering it; old orders keep it)</span>
            </label>
          </section>
          {error && <p className="reason-msg" role="alert">{error}</p>}
        </div>
        <div className="sheet__foot menued__foot">
          <button type="button" className="linkbtn" onClick={onClose}>Cancel</button>
          <button type="submit" className="cta">Save</button>
        </div>
      </form>
    </>
  );
}

export function MenuView({ owner, onBack }: { owner: boolean; onBack: () => void }) {
  useMenu();
  const [picked, setSection] = useState<Category | 'combos' | null>(null);
  /** His own sections (SCRUM-241): new (null) or one to change. */
  const [sectionEdit, setSectionEdit] = useState<{ section: Section | null } | null>(null);
  // Managers see the sections on offer; the owner sees his hidden ones too, to bring them back.
  // A printed section with nothing on offer has no tab, as on the Register (Bata Kade: CheesyBeez'
  // printed menu, every item hidden, is not theirs to see or bring back).
  const sections = menuSections().filter((s) => (owner || !s.hidden)
    && !(s.printed && !menuItems().some((m) => m.category === s.id && !m.removed && !m.hidden)));
  /** Combo packs (SCRUM-231): managers and the owner make them. */
  const mayCombos = owner || managesRole(currentCashier().role);
  const [comboEdit, setComboEdit] = useState<{ id: string | null; combo: Combo | null } | null>(null);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; undo: () => void } | null>(null);
  /** The picked section, else the first one shown (the menu loads after the screen, so never a stale one). */
  const section: Category | 'combos' = picked ?? sections[0]?.id ?? 'combos';
  const items = menuItems().filter((m) => m.category === section && !m.removed);
  const here = sectionById(section) ?? sections[0];
  const costs = useCostContext();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  // Esc goes back one step like on every place (nav.ts); its sheets close themselves first.

  const said = (message: string, undo: () => void) => setToast({ id: Date.now(), message, undo });

  return (
    <div className="owner">
      <OwnerNav current="menu" onRegister={onBack} />
      <main className="owner__main menuv" aria-label="Menu">
        <h1 className="menuv__title">Menu</h1>
        <p className="menuv__lead">
          {owner ? 'Change a price, a name or what is on offer, or add something new. It reaches the counter and the kitchen at once.'
            : 'Mark something sold out for today. Prices and names are changed by the owner.'}
        </p>
        <nav className="cats" aria-label="Menu sections">
          {sections.map((s) => (
            <button key={s.id} type="button" className={`pill${s.hidden ? ' pill--hidden' : ''}`} aria-pressed={section === s.id} onClick={() => setSection(s.id)}>
              {s.label}{s.hidden ? ' (hidden)' : ''}
            </button>
          ))}
          <button type="button" className="pill" aria-pressed={section === 'combos'} onClick={() => setSection('combos')}>Combos</button>
          {owner && <button type="button" className="chip" onClick={() => setSectionEdit({ section: null })}>+ Section</button>}
        </nav>
        {section === 'combos' && (
          <>
            <ul className="menuv__list">
              {comboEntries().length === 0 && <li className="menuv__row"><span className="menuv__name"><span>No combos yet. A combo is a box of dishes at one price; one tap sells it on the Register.</span></span></li>}
              {comboEntries().map(({ id, combo }) => {
                const blocked = comboBlocked(combo, menuItems());
                const alone = separatePrice(combo, menuItems());
                return (
                  <li key={id} className={`menuv__row${combo.hidden ? ' menuv__row--hidden' : ''}`}>
                    <div className="menuv__name">
                      <b>{combo.name.en}</b>
                      <span className="num">{fmt(combo.price)}{alone > combo.price ? ` · saves ${fmt(alone - combo.price)} on the usual box` : ''}</span>
                      <span>{combo.slots.length} {combo.slots.length === 1 ? 'slot' : 'slots'}</span>
                    </div>
                    <div className="menuv__tags">
                      {combo.hidden ? <span className="status status--unpaid">Off the Register</span>
                        : blocked && <span className="menuv__out">{blocked}</span>}
                    </div>
                    {mayCombos && (
                      <>
                        <button type="button" className="chip" onClick={() => {
                          const { hidden: _was, ...shown } = combo;
                          const after: Combo = combo.hidden ? shown : { ...combo, hidden: true };
                          saveCombo(id, combo, after);
                          said(after.hidden ? `${combo.name.en} is off the Register` : `${combo.name.en} is back on the Register`, () => saveCombo(id, after, combo));
                        }}>{combo.hidden ? 'Put back' : 'Take off'}</button>
                        <button type="button" className="chip chip--solid" onClick={() => setComboEdit({ id, combo })} aria-label={`Change ${combo.name.en}`}>Change</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {mayCombos
              ? <button type="button" className="chip menuv__add" onClick={() => setComboEdit({ id: null, combo: null })}>+ Add a combo</button>
              : <p className="menuv__lead">Combos are made by a manager or the owner.</p>}
          </>
        )}
        {section !== 'combos' && <ul className="menuv__list">
          {items.map((m) => (
            <li key={m.id} className={`menuv__row${m.hidden ? ' menuv__row--hidden' : ''}${m.soldOut ? ' menuv__row--out' : ''}`}>
              <div className="menuv__name">
                <b>{m.name.en}</b>
                {(m.name.si || m.name.ta) && <span>{[m.name.si, m.name.ta].filter(Boolean).join(' · ')}</span>}
                <span className="num">{prices(m)}</span>
              </div>
              <div className="menuv__tags">
                {m.added && <span className="status status--paid">Added</span>}
                {m.edited && <span className="status status--paid">Changed</span>}
                {m.hidden && <span className="status status--unpaid">Hidden</span>}
                {m.soldOut && !m.hidden && <span className="menuv__out">Sold out</span>}
              </div>
              {!m.hidden && (
                // One switch, on = can be sold. Its colour and its word say which, so nobody has to
                // work out whether a button shows the state or the action.
                <button
                  type="button" role="switch" className={`avail${m.soldOut ? ' avail--out' : ''}`} aria-checked={!m.soldOut}
                  aria-label={`Available today: ${m.name.en}`}
                  onClick={() => {
                    setSoldOut(m.id, !m.soldOut);
                    said(m.soldOut ? `${m.name.en} is back` : `${m.name.en}: sold out until morning`, () => setSoldOut(m.id, Boolean(m.soldOut)));
                  }}
                >
                  <span className="avail__track" aria-hidden="true"><span className="avail__knob" /></span>
                  <span className="avail__text">{m.soldOut ? 'Sold out today' : 'Available'}</span>
                </button>
              )}
              {owner && <button type="button" className="chip chip--solid" onClick={() => setEditing(m)} aria-label={`Change ${m.name.en}`}>Change</button>}
            </li>
          ))}
        </ul>}
        {section !== 'combos' && items.length === 0 && (
          <p className="menuv__lead">Nothing in {here.label} yet.{owner ? ' Add its first dish.' : ''}</p>
        )}
        {owner && section !== 'combos' && (
          <div className="menuv__actions">
            <button type="button" className="chip menuv__add" onClick={() => setAdding(true)}>+ {addWords(here)}</button>
            <button type="button" className="chip menuv__add" onClick={() => setSectionEdit({ section: here })} aria-label={`Change the ${here.label} section`}>Change section</button>
          </div>
        )}
      </main>
      {adding && <AddDish section={here} onClose={() => setAdding(false)} onSaved={(msg, undo) => { setAdding(false); said(msg, undo); }} />}
      {editing && <Editor item={editing} onClose={() => setEditing(null)} onSaved={(msg, undo) => { setEditing(null); said(msg, undo); }} />}
      {comboEdit && (
        <ComboEditor comboId={comboEdit.id} combo={comboEdit.combo} ctx={costs}
          onClose={() => setComboEdit(null)} onSaved={(msg, undo) => { setComboEdit(null); said(msg, undo); }} />
      )}
      {sectionEdit && (
        <SectionSheet section={sectionEdit.section} onClose={() => setSectionEdit(null)}
          onSaved={(msg, undo, select) => { setSectionEdit(null); if (select) setSection(select as Category); said(msg, undo); }} />
      )}
      {toast && !editing && !adding && !comboEdit && !sectionEdit && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
