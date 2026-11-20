import { Lock, LockOpen, Wand2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { checkTheme, COLOR_KEYS, COLOR_LABELS, FONT_IDS, FONTS, PRESET_LABELS, PRESETS, type ColorKey, type PresetId, type Theme } from '../../shared/theme';
import { familyOf, ThemeSwatch } from './Fonts';
import { AssetPicker } from './Inspector';
import { Field } from './ui';

/** Festgehaltene Werte (Pfad wie „colors.accent“, „fonts.heading“, „buttons.shape“) */
export type Locks = Set<string>;

function LockBtn({ path, locks, onLocks, label }: { path: string; locks?: Locks; onLocks?: (l: Locks) => void; label: string }) {
  if (!locks || !onLocks) return null;
  const on = locks.has(path);
  return (
    <button
      type="button"
      className="btn ghost icon sm"
      aria-pressed={on}
      aria-label={on ? `${label}: festgehalten (lösen)` : `${label} festhalten`}
      title={on ? 'Festgehalten – bleibt bei neuen KI-Varianten erhalten' : 'Festhalten für neue KI-Varianten'}
      onClick={() => {
        const n = new Set(locks);
        if (on) n.delete(path);
        else n.add(path);
        onLocks(n);
      }}
      style={on ? { color: 'var(--leaf)' } : undefined}
    >
      {on ? <Lock className="lucide" /> : <LockOpen className="lucide" />}
    </button>
  );
}

const Choice = <T extends string>({ label, value, options, onChange, disabled, lock }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled: boolean; lock?: ReactNode }) => (
  <div className="field">
    <span className="label row" style={{ justifyContent: 'space-between' }}>
      {label}
      {lock}
    </span>
    <div className="seg" role="radiogroup" aria-label={label} style={{ flexWrap: 'wrap' }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} disabled={disabled}>
          {l}
        </button>
      ))}
    </div>
  </div>
);

export function ThemeEditor({ theme, onChange, disabled, locks, onLocks, onAi }: { theme: Theme; onChange: (t: Theme) => void; disabled: boolean; locks?: Locks; onLocks?: (l: Locks) => void; onAi?: () => void }) {
  const [fontPick, setFontPick] = useState<null | 'heading' | 'body'>(null);
  const set = (p: Partial<Theme>) => onChange({ ...theme, ...p, preset: p.preset ?? 'eigenes' });
  const checks = checkTheme(theme);
  const bad = checks.filter((c) => !c.ok);
  const lk = (path: string, label: string) => <LockBtn path={path} locks={locks} onLocks={onLocks} label={label} />;
  return (
    <div>
      <h2 className="h">Designrichtung</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            className="card"
            style={{ padding: 6, cursor: 'pointer', textAlign: 'left', borderColor: theme.preset === id ? 'var(--leaf)' : undefined, boxShadow: theme.preset === id ? '0 0 0 2px color-mix(in srgb,var(--leaf) 20%,transparent)' : undefined }}
            onClick={() => onChange(PRESETS[id])}
            aria-pressed={theme.preset === id}
            disabled={disabled}
          >
            <ThemeSwatch theme={PRESETS[id]} compact />
            <span style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginTop: 6 }}>{PRESET_LABELS[id].name}</span>
          </button>
        ))}
      </div>
      {theme.preset === 'eigenes' && <p className="muted small" style={{ marginTop: -4 }}>Eigene Anpassung. Ein Klick auf eine Richtung setzt alle Werte zurück.</p>}
      {onAi && (
        <button type="button" className="btn" style={{ width: '100%', marginBottom: 16 }} onClick={onAi} disabled={disabled}>
          <Wand2 className="lucide" aria-hidden="true" /> Design aus Homepage übernehmen
        </button>
      )}

      <h2 className="h">Farben</h2>
      {bad.length > 0 && (
        <div className="callout warn" style={{ marginBottom: 10 }}>
          <span className="grow">
            Zu wenig Kontrast: {bad.map((b) => `${b.label} ${b.ratio}:1`).join(', ')} (mindestens 4,5:1).
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={disabled}
            onClick={() => {
              const colors = { ...theme.colors };
              for (const b of bad) if (b.suggestion) colors[b.fg] = b.suggestion;
              set({ colors });
            }}
          >
            Korrigieren
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '0 12px' }}>
        {COLOR_KEYS.map((k: ColorKey) => {
          const issue = checks.find((c) => !c.ok && c.fg === k);
          return (
            <Field key={k} label={COLOR_LABELS[k]} error={issue ? `Kontrast ${issue.ratio}:1` : null}>
              {(id) => (
                <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                  <input type="color" aria-label={`${COLOR_LABELS[k]} wählen`} value={theme.colors[k]} onChange={(e) => set({ colors: { ...theme.colors, [k]: e.target.value.toUpperCase() } })} disabled={disabled} style={{ width: 38, height: 38, padding: 2, border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--panel)', flex: 'none' }} />
                  <HexInput id={id} value={theme.colors[k]} onCommit={(v) => set({ colors: { ...theme.colors, [k]: v } })} disabled={disabled} invalid={!!issue} />
                  {lk(`colors.${k}`, COLOR_LABELS[k])}
                </div>
              )}
            </Field>
          );
        })}
      </div>

      <h2 className="h" style={{ marginTop: 8 }}>Schriften</h2>
      <div className="two">
        {(['heading', 'body'] as const).map((role) => (
          <Field key={role} label={role === 'heading' ? 'Überschriften' : 'Fließtext'}>
            {(id) => (
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <select
                  id={id}
                  className="input"
                  value={theme.fonts[role]}
                  onChange={(e) => (e.target.value === '__upload' ? setFontPick(role) : set({ fonts: { ...theme.fonts, [role]: e.target.value } }))}
                  disabled={disabled}
                  style={{ fontFamily: familyOf(theme.fonts[role]) }}
                >
                  {FONT_IDS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: familyOf(f) }}>
                      {FONTS[f].family}
                    </option>
                  ))}
                  {theme.fonts[role].startsWith('upload:') && <option value={theme.fonts[role]}>Eigene Schrift</option>}
                  <option value="__upload">Eigene Schrift hochladen …</option>
                </select>
                {lk(`fonts.${role}`, role === 'heading' ? 'Überschriftenschrift' : 'Textschrift')}
              </div>
            )}
          </Field>
        ))}
      </div>

      <h2 className="h" style={{ marginTop: 8 }}>Formen und Aufbau</h2>
      <Choice label="Knopfform" value={theme.buttons.shape} options={[['square', 'Eckig'], ['soft', 'Leicht gerundet'], ['round', 'Rund'], ['pill', 'Pille']]} onChange={(shape) => set({ buttons: { ...theme.buttons, shape } })} disabled={disabled} lock={lk('buttons.shape', 'Knopfform')} />
      <Choice label="Knopfstil" value={theme.buttons.style} options={[['solid', 'Gefüllt'], ['outline', 'Umrandet']]} onChange={(style) => set({ buttons: { ...theme.buttons, style } })} disabled={disabled} lock={lk('buttons.style', 'Knopfstil')} />
      <Choice label="Hauptaktion" value={theme.primaryAction} options={[['button', 'Knopf'], ['pill-sticky', 'Große Pille, mitlaufend']]} onChange={(primaryAction) => set({ primaryAction })} disabled={disabled} lock={lk('primaryAction', 'Hauptaktion')} />
      <Choice label="Links als" value={theme.linkLayout} options={[['list', 'Liste'], ['cards', 'Karten'], ['tiles', 'Bildkacheln']]} onChange={(linkLayout) => set({ linkLayout })} disabled={disabled} lock={lk('linkLayout', 'Link-Darstellung')} />
      <Choice label="Kopf" value={theme.header.layout} options={[['text', 'Text'], ['photo-top', 'Foto oben'], ['photo-side', 'Foto seitlich']]} onChange={(layout) => set({ header: { ...theme.header, layout } })} disabled={disabled} lock={lk('header.layout', 'Kopf-Layout')} />
      <Choice label="Logogröße" value={theme.header.logoSize} options={[['S', 'Klein'], ['M', 'Mittel'], ['L', 'Groß']]} onChange={(logoSize) => set({ header: { ...theme.header, logoSize } })} disabled={disabled} />
      <Choice label="Kartenstil" value={theme.cards.style} options={[['line', 'Linie'], ['fill', 'Fläche'], ['none', 'Ohne']]} onChange={(style) => set({ cards: { ...theme.cards, style } })} disabled={disabled} lock={lk('cards.style', 'Kartenstil')} />
      <Field label={`Rundung der Karten: ${theme.cards.radius} px`}>
        {(id) => <input id={id} type="range" min={0} max={28} value={theme.cards.radius} onChange={(e) => set({ cards: { ...theme.cards, radius: Number(e.target.value) } })} disabled={disabled} style={{ width: '100%', accentColor: 'var(--leaf)' }} />}
      </Field>
      <Choice label="Abstände" value={theme.density} options={[['compact', 'Kompakt'], ['normal', 'Normal'], ['airy', 'Großzügig']]} onChange={(density) => set({ density })} disabled={disabled} lock={lk('density', 'Abstände')} />
      <label className="check">
        <input type="checkbox" checked={theme.sectionBand} onChange={(e) => set({ sectionBand: e.target.checked })} disabled={disabled} /> Ersten Linkabschnitt als farbiges Band hervorheben
      </label>
      {fontPick && (
        <AssetPicker
          kind="font"
          current={null}
          onClose={() => setFontPick(null)}
          onPick={(id) => {
            set({ fonts: { ...theme.fonts, [fontPick]: `upload:${id}` } });
            setFontPick(null);
          }}
        />
      )}
    </div>
  );
}

/** Hex-Eingabe mit eigenem Zwischenstand: übernimmt erst gültige Werte, setzt beim Verlassen zurück. */
function HexInput({ id, value, onCommit, disabled, invalid }: { id: string; value: string; onCommit: (v: string) => void; disabled: boolean; invalid: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      id={id}
      className="input"
      value={draft}
      onChange={(e) => {
        const v = e.target.value.trim();
        setDraft(v);
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) onCommit(`#${v.replace('#', '').toUpperCase()}`);
      }}
      onBlur={() => setDraft(value)}
      style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13 }}
      disabled={disabled}
      maxLength={7}
      spellCheck={false}
      aria-invalid={invalid}
    />
  );
}
