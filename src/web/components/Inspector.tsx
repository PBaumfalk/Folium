import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { BLOCK_LABELS, ICONS, SOCIAL_LABELS, SOCIAL_NETWORKS, validateUrl, type Block, type PageContent } from '../../shared/content';
import { api, type Asset } from '../lib/api';
import { Dialog, ErrorBox, Field, Loading, Spinner, useToast } from './ui';

type Patch<T> = (p: Partial<T>) => void;

function urlError(v: string, allowed: ('http' | 'https' | 'tel' | 'mailto')[]): string | null {
  if (!v.trim()) return 'Bitte eine Adresse angeben.';
  try {
    validateUrl(v, allowed);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const Text = ({ label, value, onChange, hint, max, multi, error, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; max?: number; multi?: boolean; error?: string | null; placeholder?: string; disabled?: boolean }) => (
  <Field label={label} hint={hint} error={error}>
    {(id) =>
      multi ? (
        <textarea id={id} className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} disabled={disabled} />
      ) : (
        <input id={id} className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} disabled={disabled} />
      )
    }
  </Field>
);

export function Schedule({ b, set, disabled }: { b: Block; set: Patch<Block>; disabled: boolean }) {
  return (
    <details className="panel" style={{ padding: '10px 14px', marginTop: 4 }} open={Boolean(b.visibleFrom || b.visibleUntil)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Sichtbarkeit und Zeitplan</summary>
      <div style={{ marginTop: 12 }}>
        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={b.enabled} onChange={(e) => set({ enabled: e.target.checked })} disabled={disabled} /> Auf der Seite anzeigen
        </label>
        <div className="two">
          <Field label="Sichtbar ab" hint="Leer = sofort">
            {(id) => <input id={id} type="datetime-local" className="input" value={b.visibleFrom ?? ''} onChange={(e) => set({ visibleFrom: e.target.value || null })} disabled={disabled} />}
          </Field>
          <Field label="Sichtbar bis" hint="Einschließlich dieser Minute">
            {(id) => <input id={id} type="datetime-local" className="input" value={b.visibleUntil ?? ''} onChange={(e) => set({ visibleUntil: e.target.value || null })} disabled={disabled} />}
          </Field>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Zeiten gelten in Europe/Berlin. Die Änderung wirkt erst nach dem Veröffentlichen.</p>
      </div>
    </details>
  );
}

export function BlockInspector({ block, onChange, disabled }: { block: Block; onChange: (b: Block) => void; disabled: boolean }) {
  const set = (p: Partial<Block>) => onChange({ ...block, ...p } as Block);
  const b = block;
  let body: ReactNode = null;
  switch (b.type) {
    case 'action': {
      const allowed = b.kind === 'call' ? (['tel'] as const) : b.kind === 'email' ? (['mailto'] as const) : (['http', 'https', 'tel', 'mailto'] as const);
      const val = b.kind === 'call' ? (b.value.startsWith('tel:') ? b.value : `tel:${b.value}`) : b.kind === 'email' ? (b.value.startsWith('mailto:') ? b.value : `mailto:${b.value}`) : b.value;
      body = (
        <>
          <Field label="Art">
            {(id) => (
              <select id={id} className="input" value={b.kind} onChange={(e) => set({ kind: e.target.value as typeof b.kind })} disabled={disabled}>
                <option value="call">Anrufen</option>
                <option value="email">E-Mail schreiben</option>
                <option value="booking">Termin vereinbaren (Link zum Buchungssystem)</option>
                <option value="contact">Kontakt aufnehmen (Link zum Formular)</option>
              </select>
            )}
          </Field>
          <Text label="Beschriftung" value={b.label} max={60} onChange={(label) => set({ label })} disabled={disabled} error={!b.label.trim() ? 'Bitte eine Beschriftung angeben.' : null} />
          <Text
            label={b.kind === 'call' ? 'Telefonnummer' : b.kind === 'email' ? 'E-Mail-Adresse' : 'Adresse (URL)'}
            value={b.value}
            onChange={(value) => set({ value })}
            placeholder={b.kind === 'call' ? '+49 30 12345670' : b.kind === 'email' ? 'info@example.com' : 'https://…'}
            error={urlError(val, [...allowed])}
            disabled={disabled}
            hint="Die erste Hauptaktion oben auf der Seite wird am stärksten hervorgehoben."
          />
        </>
      );
      break;
    }
    case 'link':
      body = (
        <>
          <Text label="Titel" value={b.title} max={120} onChange={(title) => set({ title })} disabled={disabled} error={!b.title.trim() ? 'Bitte einen Titel angeben.' : null} />
          <Text label="Beschreibung (optional)" value={b.description} max={240} onChange={(description) => set({ description })} disabled={disabled} />
          <Text label="Ziel" value={b.url} onChange={(url) => set({ url })} placeholder="https://…" error={urlError(b.url, ['http', 'https', 'tel', 'mailto'])} disabled={disabled} />
          <div className="two">
            <Field label="Symbol">
              {(id) => (
                <select id={id} className="input" value={b.icon ?? ''} onChange={(e) => set({ icon: (e.target.value || null) as typeof b.icon })} disabled={disabled}>
                  <option value="">Automatisch</option>
                  {ICONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <ImageField label="Bild (optional)" value={b.imageAssetId} onChange={(imageAssetId) => set({ imageAssetId })} disabled={disabled} hint="Wird im Layout „Bildkacheln“ groß gezeigt." />
          </div>
        </>
      );
      break;
    case 'heading':
      body = <Text label="Überschrift" value={b.text} max={80} onChange={(text) => set({ text })} disabled={disabled} hint="Gruppiert die folgenden Einträge zu einem Abschnitt." />;
      break;
    case 'location':
      body = (
        <>
          <div className="two">
            <Text label="Name" value={b.name} max={80} onChange={(name) => set({ name })} disabled={disabled} />
            <Text label="Rolle" value={b.role} max={120} onChange={(role) => set({ role })} placeholder="Hauptsitz" disabled={disabled} />
          </div>
          <Text label="Adresse" value={b.address} max={300} onChange={(address) => set({ address })} multi disabled={disabled} />
          <Text label="Hinweis (optional)" value={b.note} max={240} onChange={(note) => set({ note })} placeholder="Fünf Minuten vom Bahnhof" disabled={disabled} />
          <Text label="Routenlink (optional)" value={b.routeUrl ?? ''} onChange={(v) => set({ routeUrl: v || null })} placeholder="https://www.openstreetmap.org/…" error={b.routeUrl ? urlError(b.routeUrl, ['https']) : null} disabled={disabled} />
        </>
      );
      break;
    case 'contact':
      body = (
        <>
          <Text label="Telefon" value={b.phone ?? ''} max={40} onChange={(v) => set({ phone: v || null })} disabled={disabled} />
          <Text label="E-Mail" value={b.email ?? ''} max={200} onChange={(v) => set({ email: v || null })} disabled={disabled} />
          <Text label="Sprechzeiten" value={b.hours ?? ''} max={200} onChange={(v) => set({ hours: v || null })} disabled={disabled} />
        </>
      );
      break;
    case 'text':
      body = <Text label="Text" value={b.text} max={1000} multi onChange={(text) => set({ text })} disabled={disabled} hint="Reiner Text. Leerzeile = neuer Absatz." />;
      break;
    case 'social':
      body = (
        <div>
          {b.items.map((it, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
              <Field label={`Netzwerk ${i + 1}`}>
                {(id) => (
                  <select id={id} className="input" value={it.network} onChange={(e) => set({ items: b.items.map((x, j) => (j === i ? { ...x, network: e.target.value as typeof x.network } : x)) })} disabled={disabled}>
                    {SOCIAL_NETWORKS.map((n) => (
                      <option key={n} value={n}>
                        {SOCIAL_LABELS[n]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="grow">
                <Text label="Profil-Adresse" value={it.url} onChange={(url) => set({ items: b.items.map((x, j) => (j === i ? { ...x, url } : x)) })} error={urlError(it.url, ['https', 'http'])} disabled={disabled} />
              </div>
              <button className="btn icon" style={{ marginBottom: 14 }} onClick={() => set({ items: b.items.filter((_, j) => j !== i) })} aria-label={`Netzwerk ${i + 1} entfernen`} disabled={disabled}>
                <X className="lucide" />
              </button>
            </div>
          ))}
          <button className="btn sm" onClick={() => set({ items: [...b.items, { network: 'linkedin', url: 'https://' }] })} disabled={disabled || b.items.length >= 10}>
            <Plus className="lucide" /> Profil hinzufügen
          </button>
        </div>
      );
      break;
  }
  return (
    <div>
      <h2 className="h">{BLOCK_LABELS[b.type]} bearbeiten</h2>
      {body}
      <Schedule b={b} set={set} disabled={disabled} />
    </div>
  );
}

export function ProfileEditor({ content, onChange, disabled }: { content: PageContent; onChange: (c: PageContent) => void; disabled: boolean }) {
  const p = content.profile;
  const set = (x: Partial<PageContent['profile']>) => onChange({ ...content, profile: { ...p, ...x } });
  return (
    <div>
      <h2 className="h">Kopf der Seite</h2>
      <Text label="Name" value={p.name} max={80} onChange={(name) => set({ name })} disabled={disabled} error={!p.name.trim() ? 'Bitte einen Namen angeben.' : null} />
      <Text label="Kurzbeschreibung" value={p.tagline} max={200} onChange={(tagline) => set({ tagline })} multi disabled={disabled} />
      <Field label="Persönliche Angaben (eine pro Zeile, höchstens 5)" hint="z. B. Titel, Qualifikationen, Sprachen">
        {(id) => (
          <textarea
            id={id}
            className="input"
            value={p.details.join('\n')}
            onChange={(e) => set({ details: e.target.value.split('\n').slice(0, 5).map((s) => s.slice(0, 120)) })}
            onBlur={() => set({ details: p.details.map((s) => s.trim()).filter(Boolean) })}
            disabled={disabled}
          />
        )}
      </Field>
      <div className="two">
        <ImageField label="Logo" value={p.logoAssetId} onChange={(logoAssetId) => set({ logoAssetId })} disabled={disabled} />
        <ImageField label="Profilbild (rund)" value={p.avatarAssetId} onChange={(avatarAssetId) => set({ avatarAssetId })} disabled={disabled} hint="Nur im Kopf ohne Titelbild." />
      </div>
      <ImageField label="Titelbild" value={p.coverAssetId} onChange={(coverAssetId) => set({ coverAssetId })} disabled={disabled} hint="Für die Kopf-Layouts „Foto oben“ und „Foto seitlich“." />
    </div>
  );
}

export function LegalEditor({ content, onChange, disabled }: { content: PageContent; onChange: (c: PageContent) => void; disabled: boolean }) {
  const l = content.legal;
  const m = content.meta;
  return (
    <div>
      <h2 className="h">Pflichtangaben</h2>
      <Text label="Impressum" value={l.imprintUrl ?? ''} onChange={(v) => onChange({ ...content, legal: { ...l, imprintUrl: v || null } })} error={l.imprintUrl ? urlError(l.imprintUrl, ['https', 'http']) : 'Ohne Impressum kann die Seite nicht veröffentlicht werden.'} disabled={disabled} />
      <Text label="Datenschutzerklärung" value={l.privacyUrl ?? ''} onChange={(v) => onChange({ ...content, legal: { ...l, privacyUrl: v || null } })} error={l.privacyUrl ? urlError(l.privacyUrl, ['https', 'http']) : 'Ohne Datenschutzerklärung kann die Seite nicht veröffentlicht werden.'} disabled={disabled} />
      <h2 className="h" style={{ marginTop: 20 }}>Suchmaschinen und Teilen</h2>
      <Text label="Titel im Browser-Tab (optional)" value={m.title} max={120} onChange={(title) => onChange({ ...content, meta: { ...m, title } })} disabled={disabled} hint="Leer = Name der Seite" />
      <Text label="Beschreibung (optional)" value={m.description} max={300} multi onChange={(description) => onChange({ ...content, meta: { ...m, description } })} disabled={disabled} hint="Leer = Kurzbeschreibung" />
      <label className="check">
        <input type="checkbox" checked={m.noindex} onChange={(e) => onChange({ ...content, meta: { ...m, noindex: e.target.checked } })} disabled={disabled} /> Nicht in Suchmaschinen aufnehmen (noindex)
      </label>
    </div>
  );
}

// ── Bilder ────────────────────────────────────────────────────────────

export function ImageField({ label, value, onChange, disabled, hint }: { label: string; value: string | null; onChange: (id: string | null) => void; disabled: boolean; hint?: string }) {
  const [open, setOpen] = useState(false);
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => api.get<Asset[]>('/api/v1/assets') });
  const a = assets.data?.find((x) => x.id === value);
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="imgpick">
        <div className="prev">{a ? <img src={a.url} alt="" /> : <ImagePlus className="lucide" aria-hidden="true" style={{ color: 'var(--ink-3)' }} />}</div>
        <div className="row">
          <button type="button" className="btn sm" onClick={() => setOpen(true)} disabled={disabled}>
            {value ? 'Ändern' : 'Auswählen'}
          </button>
          {value && (
            <button type="button" className="btn ghost sm" onClick={() => onChange(null)} disabled={disabled}>
              Entfernen
            </button>
          )}
        </div>
      </div>
      {hint && <div className="hint">{hint}</div>}
      {open && (
        <AssetPicker
          kind="image"
          onClose={() => setOpen(false)}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          current={value}
        />
      )}
    </div>
  );
}

export function AssetPicker({ onClose, onPick, current, kind }: { onClose: () => void; onPick: (id: string) => void; current: string | null; kind: 'image' | 'font' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => api.get<Asset[]>('/api/v1/assets') });
  const list = (assets.data ?? []).filter((a) => (kind === 'font' ? a.kind === 'font' : a.kind !== 'font'));
  const upload = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error('Die Datei ist größer als 5 MB.');
      const fd = new FormData();
      fd.append('file', f);
      const a = await api.post<Asset>('/api/v1/assets', fd);
      await qc.invalidateQueries({ queryKey: ['assets'] });
      toast({ text: 'Datei hochgeladen.' });
      onPick(a.id);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={kind === 'font' ? 'Schrift auswählen' : 'Bild auswählen'} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Schließen</button>}>
      <p className="muted" style={{ marginTop: 0 }}>
        {kind === 'font' ? 'WOFF2, TTF oder OTF bis 5 MB. Bitte nur Schriften hochladen, deren Lizenz die Nutzung im Web erlaubt.' : 'JPEG, PNG, WebP, AVIF oder SVG bis 5 MB. Bilder werden verkleinert und ohne Metadaten (z. B. Standort) gespeichert.'}
      </p>
      <input ref={input} type="file" className="sr" accept={kind === 'font' ? '.woff2,.ttf,.otf' : 'image/*,.svg'} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      <button className="btn" onClick={() => input.current?.click()} disabled={busy} style={{ marginBottom: 14 }}>
        {busy ? <Spinner /> : <Upload className="lucide" />} Datei hochladen
      </button>
      {error && <ErrorBox error={error} />}
      {assets.isLoading && <Loading lines={2} />}
      {list.length === 0 && !assets.isLoading && <p className="muted">Noch keine {kind === 'font' ? 'Schriften' : 'Bilder'} hochgeladen.</p>}
      <div className="assets">
        {list.map((a) => (
          <button key={a.id} className={a.id === current ? 'sel' : ''} onClick={() => onPick(a.id)} title={a.label} aria-label={`${a.label} auswählen`} aria-pressed={a.id === current}>
            {a.kind === 'font' ? <span style={{ fontSize: 12, padding: 6, display: 'block' }}>{a.label}</span> : <img src={a.url} alt="" loading="lazy" />}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export { Trash2 };
