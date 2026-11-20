import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PRESET_LABELS, PRESETS, type PresetId } from '../../shared/theme';
import { useCan, useSession } from '../App';
import { FontFaces, ThemeSwatch } from '../components/Fonts';
import { Dialog, ErrorBox, Field, fmtRel, Loading, Spinner, useToast } from '../components/ui';
import { api, ApiError, type PageView } from '../lib/api';

export function StatusBadge({ p }: { p: PageView }) {
  if (!p.published) return <span className="badge">Nie veröffentlicht</span>;
  if (p.hasUnpublishedChanges) return <span className="badge warn">Unveröffentlichte Änderungen</span>;
  return <span className="badge ok">Veröffentlicht</span>;
}

export function PagesList() {
  const session = useSession();
  const canEdit = useCan('editor');
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['pages'], queryFn: () => api.get<PageView[]>('/api/v1/pages') });
  const dup = useMutation({
    mutationFn: (id: number) => api.post<PageView>(`/api/v1/pages/${id}/duplicate`),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['pages'] });
      toast({ text: `Kopie „${p.name}“ angelegt.` });
      nav(`/seiten/${p.id}`);
    },
    onError: (e) => toast({ text: (e as Error).message, kind: 'bad' }),
  });

  return (
    <>
      <FontFaces />
      <div className="head">
        <div>
          <h1 className="title">Linkseiten</h1>
          <p className="sub">Seiten für die Organisation, einzelne Personen, Standorte und Kampagnen.</p>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus className="lucide" aria-hidden="true" /> Neue Seite
          </button>
        )}
      </div>
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && (
        <div className="empty">
          <h2>Noch keine Seite</h2>
          <p>Legen Sie die erste Linkseite an. Die Vorlage „Organisation“ bringt Telefon, Standorte und Leistungen schon mit.</p>
          {canEdit && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Plus className="lucide" aria-hidden="true" /> Neue Seite
            </button>
          )}
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <div className="pages">
          {q.data.map((p) => (
            <article key={p.id} className="pcard">
              <div className="thumb">
                <iframe title={`Vorschau ${p.name}`} src={`/api/v1/pages/${p.id}/preview?embed=1`} loading="lazy" tabIndex={-1} aria-hidden="true" sandbox="allow-same-origin" />
              </div>
              <div className="body">
                <Link className="name" to={`/seiten/${p.id}`}>
                  {p.name}
                </Link>
                <div className="url">{`${session.publicBaseUrl.replace(/^https?:\/\//, '')}/${p.slug}`}</div>
                <div className="row">
                  <StatusBadge p={p} />
                  <span className="muted small">geändert {fmtRel(p.draft.updatedAt)}</span>
                </div>
                <div className="row actions">
                  {p.published && (
                    <a className="btn sm" href={`${session.publicBaseUrl}/${p.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="lucide" aria-hidden="true" /> Öffnen
                    </a>
                  )}
                  {canEdit && (
                    <button className="btn sm" onClick={() => dup.mutate(p.id)} disabled={dup.isPending}>
                      <Copy className="lucide" aria-hidden="true" /> Duplizieren
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </>
  );
}

const TEMPLATES = [
  { id: 'organisation', name: 'Organisation', text: 'Telefon, Termin, Leistungen, zwei Standorte' },
  { id: 'person', name: 'Person', text: 'Person mit Schwerpunkten und Kontakt' },
  { id: 'standort', name: 'Standort', text: 'Ein Standort mit Sprechzeiten und Anfahrt' },
  { id: 'kampagne', name: 'Kampagne', text: 'Kurzer Text und eine klare Aktion' },
  { id: 'leer', name: 'Leer', text: 'Ohne Inhalte beginnen' },
] as const;

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function NewPageDialog({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['id']>('organisation');
  const [preset, setPreset] = useState<PresetId>(session.defaultPreset ?? 'editorial');
  const m = useMutation({
    mutationFn: () => api.post<PageView>('/api/v1/pages', { name, slug: slug || toSlug(name), preset, template }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['pages'] });
      nav(`/seiten/${p.id}`);
    },
  });
  const err = m.error as ApiError | null;
  const effSlug = slug || toSlug(name);
  return (
    <Dialog
      title="Neue Linkseite"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose} data-close>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>
            {m.isPending && <Spinner />} Seite anlegen
          </button>
        </>
      }
    >
      {err && !err.field && <ErrorBox error={err} />}
      <div className="two">
        <Field label="Name (nur intern)" error={err?.field === 'name' ? err.message : null}>
          {(id) => (
            <input
              id={id}
              className="input"
              value={name}
              placeholder="z. B. Instagram-Profil"
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(toSlug(e.target.value));
              }}
            />
          )}
        </Field>
        <Field label="Adresse" hint={`${session.publicBaseUrl}/${effSlug || '…'}`} error={err?.field === 'slug' ? err.message : null}>
          {(id) => (
            <input
              id={id}
              className="input"
              value={slug}
              aria-invalid={err?.field === 'slug'}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
            />
          )}
        </Field>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '4px 0 16px' }}>
        <legend className="h" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>
          Inhalt
        </legend>
        <div className="addmenu" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))' }}>
          {TEMPLATES.map((t) => (
            <label key={t.id} className="card" style={{ padding: 12, cursor: 'pointer', borderColor: template === t.id ? 'var(--leaf)' : undefined, boxShadow: template === t.id ? '0 0 0 2px color-mix(in srgb,var(--leaf) 20%,transparent)' : undefined }}>
              <input type="radio" name="tpl" className="sr" checked={template === t.id} onChange={() => setTemplate(t.id)} />
              <b style={{ display: 'block' }}>{t.name}</b>
              <span className="muted small">{t.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Design (jederzeit änderbar)</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <label key={id} className="card" style={{ padding: 10, cursor: 'pointer', borderColor: preset === id ? 'var(--leaf)' : undefined, boxShadow: preset === id ? '0 0 0 2px color-mix(in srgb,var(--leaf) 20%,transparent)' : undefined }}>
              <input type="radio" name="preset" className="sr" checked={preset === id} onChange={() => setPreset(id)} />
              <ThemeSwatch theme={PRESETS[id]} />
              <b style={{ display: 'block', marginTop: 8 }}>
                {PRESET_LABELS[id].name}
                {id === 'editorial' && <span className="badge ok" style={{ marginLeft: 6 }}>Empfohlen</span>}
              </b>
              <span className="muted small">{PRESET_LABELS[id].description}</span>
            </label>
          ))}
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>Ein Design aus der Homepage ableiten können Sie nach dem Anlegen im Bereich „Design“.</p>
      </fieldset>
    </Dialog>
  );
}
