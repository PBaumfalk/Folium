import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Plus, RotateCcw, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BLOCK_LABELS, newBlockId, type Block, type BlockType, type PageContent } from '../../shared/content';
import type { Theme } from '../../shared/theme';
import { useCan, useSession } from '../App';
import { AnalysisFlow } from '../components/AnalysisFlow';
import { BLOCK_ICONS, BlockList } from '../components/BlockList';
import { FontFaces } from '../components/Fonts';
import { BlockInspector, LegalEditor, ProfileEditor } from '../components/Inspector';
import { Preview } from '../components/Preview';
import { PublishDialog } from '../components/PublishDialog';
import { ShareTab } from '../components/ShareTab';
import { ThemeEditor, type Locks } from '../components/ThemeEditor';
import { Dialog, ErrorBox, Field, fmtDate, fmtRel, Loading, Spinner, useConfirm, useToast } from '../components/ui';
import { api, ApiError, type PageView, type Version } from '../lib/api';
import { PageStats } from './Stats';
import { StatusBadge } from './Pages';

type Tab = 'inhalt' | 'design' | 'seite' | 'versionen' | 'teilen' | 'statistik';
const TABS: [Tab, string][] = [
  ['inhalt', 'Inhalt'],
  ['design', 'Design'],
  ['seite', 'Seite'],
  ['versionen', 'Versionen'],
  ['teilen', 'Teilen'],
  ['statistik', 'Statistik'],
];

function newBlock(type: BlockType): Block {
  const base = { id: newBlockId(), enabled: true, visibleFrom: null, visibleUntil: null };
  switch (type) {
    case 'action':
      return { ...base, type, kind: 'booking', label: 'Termin vereinbaren', value: 'https://' };
    case 'link':
      return { ...base, type, title: 'Neuer Link', description: '', url: 'https://', icon: null, imageAssetId: null };
    case 'heading':
      return { ...base, type, text: 'Neuer Abschnitt' };
    case 'location':
      return { ...base, type, name: 'Standort', role: '', address: '', routeUrl: null, note: '' };
    case 'contact':
      return { ...base, type, phone: null, email: null, hours: 'Mo.–Fr. 9–17 Uhr' };
    case 'social':
      return { ...base, type, items: [] };
    case 'text':
      return { ...base, type, text: '' };
  }
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export function PageEditor() {
  const { id, tab: tabParam } = useParams();
  const pageId = Number(id);
  const tab = (TABS.find(([t]) => t === tabParam)?.[0] ?? 'inhalt') as Tab;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const session = useSession();
  const canEdit = useCan('editor');
  const q = useQuery({ queryKey: ['page', pageId], queryFn: () => api.get<PageView>(`/api/v1/pages/${pageId}`) });

  const [content, setContent] = useState<PageContent | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const rev = useRef(0);
  const [save, setSave] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const [locks, setLocks] = useState<Locks>(new Set());
  const pending = useRef<{ content?: PageContent; theme?: Theme } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState<PageView | null>(null);
  const confirmer = useConfirm();

  // Serverstand übernehmen (beim Laden und nach Aktionen wie Veröffentlichen)
  const adopt = useCallback(
    (p: PageView) => {
      setPage(p);
      setContent(p.draft.content);
      setTheme(p.draft.theme);
      rev.current = p.draft.rev;
      qc.setQueryData(['page', p.id], p);
      void qc.invalidateQueries({ queryKey: ['pages'] });
      void qc.invalidateQueries({ queryKey: ['theme-history', p.id] });
    },
    [qc],
  );
  useEffect(() => {
    if (q.data && !page) adopt(q.data);
  }, [q.data, page, adopt]);

  const flush = useCallback(async () => {
    if (!pending.current) return;
    const body = pending.current;
    pending.current = null;
    setSave('saving');
    try {
      const p = await api.patch<PageView>(`/api/v1/pages/${pageId}`, { ...body, rev: rev.current });
      rev.current = p.draft.rev;
      setPage(p);
      qc.setQueryData(['page', p.id], p);
      void qc.invalidateQueries({ queryKey: ['pages'] });
      setSave(pending.current ? 'dirty' : 'saved');
      setSaveError(null);
    } catch (e) {
      pending.current = { ...body, ...(pending.current ?? {}) };
      const err = e as ApiError;
      if (err.status === 409) setConflict(true);
      setSave('error');
      setSaveError(err.message);
    }
  }, [pageId, qc]);

  const schedule = useCallback(
    (patch: { content?: PageContent; theme?: Theme }) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      setSave('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  // Ungespeicherte Änderungen beim Verlassen sichern bzw. warnen
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  const updateContent = (c: PageContent) => {
    setContent(c);
    schedule({ content: c });
  };
  const updateTheme = (t: Theme) => {
    setTheme(t);
    schedule({ theme: t });
  };

  const del = (b: Block, index: number) => {
    if (!content) return;
    const next = { ...content, blocks: content.blocks.filter((x) => x.id !== b.id) };
    updateContent(next);
    if (selected === b.id) setSelected(null);
    toast({
      text: `„${BLOCK_LABELS[b.type]}“ gelöscht.`,
      ms: 10_000,
      action: {
        label: 'Rückgängig',
        run: () =>
          setContent((cur) => {
            if (!cur) return cur;
            const blocks = [...cur.blocks];
            blocks.splice(Math.min(index, blocks.length), 0, b);
            const restored = { ...cur, blocks };
            schedule({ content: restored });
            return restored;
          }),
      },
    });
  };

  const add = (type: BlockType) => {
    if (!content) return;
    const b = newBlock(type);
    const idx = selected ? content.blocks.findIndex((x) => x.id === selected) + 1 : content.blocks.length;
    const blocks = [...content.blocks];
    blocks.splice(idx, 0, b);
    updateContent({ ...content, blocks });
    setSelected(b.id);
  };

  const discard = useMutation({
    mutationFn: () => api.post<PageView>(`/api/v1/pages/${pageId}/discard`, { rev: rev.current }),
    onSuccess: (p) => {
      adopt(p);
      toast({ text: 'Entwurf auf die veröffentlichte Version zurückgesetzt.' });
    },
    onError: (e) => toast({ text: (e as Error).message, kind: 'bad' }),
  });
  const trash = useMutation({
    mutationFn: () => api.del(`/api/v1/pages/${pageId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pages'] });
      toast({ text: 'Seite in den Papierkorb gelegt.', action: { label: 'Rückgängig', run: () => void api.post(`/api/v1/pages/${pageId}/restore`).then(() => qc.invalidateQueries({ queryKey: ['pages'] })) } });
      nav('/');
    },
  });

  const publicUrl = page ? `${session.publicBaseUrl}/${page.slug}` : '';
  const sel = useMemo(() => content?.blocks.find((b) => b.id === selected) ?? null, [content, selected]);

  if (q.isLoading || (!page && !q.error)) return <Loading lines={4} />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  if (!page || !content || !theme) return null;

  const setTab = (t: Tab) => nav(`/seiten/${pageId}/${t}`, { replace: true });
  const disabled = !canEdit;

  return (
    <>
      <FontFaces />
      <div className="ed-head">
        <div className="ed-title">
          <Link to="/" className="btn ghost icon" aria-label="Zurück zur Übersicht">
            <ArrowLeft className="lucide" />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1>{page.name}</h1>
            <div className="row small muted">
              <StatusBadge p={page} />
              <SaveIndicator state={save} error={saveError} onRetry={() => void flush()} updatedAt={page.draft.updatedAt} />
            </div>
          </div>
        </div>
        <div className="row">
          {page.published && (
            <a className="btn" href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="lucide" aria-hidden="true" /> Öffentliche Seite
            </a>
          )}
          {canEdit && page.published && page.hasUnpublishedChanges && (
            <button className="btn" onClick={() => confirmer.ask({ title: 'Änderungen verwerfen?', text: 'Der Entwurf wird auf die zuletzt veröffentlichte Version zurückgesetzt. Ihre Änderungen seitdem gehen verloren.', label: 'Änderungen verwerfen', danger: true }, () => discard.mutate())} disabled={discard.isPending}>
              <RotateCcw className="lucide" aria-hidden="true" /> Änderungen verwerfen
            </button>
          )}
          {canEdit && (
            <button
              className="btn primary"
              onClick={async () => {
                if (timer.current) clearTimeout(timer.current);
                await flush();
                setPublishing(true);
              }}
              disabled={save === 'saving' || (!page.hasUnpublishedChanges && !pending.current)}
            >
              <Upload className="lucide" aria-hidden="true" /> Veröffentlichen
            </button>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Bereiche der Seite">
        {TABS.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'versionen' || tab === 'teilen' || tab === 'statistik' ? (
        <div style={{ maxWidth: 1000 }}>
          {tab === 'versionen' && <Versions page={page} onRestored={adopt} canEdit={canEdit} />}
          {tab === 'teilen' && <ShareTab page={page} publicUrl={publicUrl} />}
          {tab === 'statistik' && <PageStats pageId={page.id} content={content} />}
        </div>
      ) : (
        <div className="editor">
          <div>
            {tab === 'inhalt' && (
              <>
                <div className="panel">
                  <ProfileEditor content={content} onChange={updateContent} disabled={disabled} />
                </div>
                <div className="panel">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <h2 className="h" style={{ margin: 0 }}>
                      Einträge
                    </h2>
                    <span className="muted small">Ziehen oder mit den Pfeilen sortieren</span>
                  </div>
                  {content.blocks.length === 0 ? (
                    <p className="muted">Noch keine Einträge. Fügen Sie unten eine Hauptaktion (z. B. „Anrufen“) und Links hinzu.</p>
                  ) : (
                    <BlockList blocks={content.blocks} selected={selected} onSelect={setSelected} onChange={(blocks) => updateContent({ ...content, blocks })} onDelete={del} disabled={disabled} />
                  )}
                  {canEdit && (
                    <div className="addmenu" aria-label="Eintrag hinzufügen">
                      {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => {
                        const I = BLOCK_ICONS[t];
                        return (
                          <button key={t} className="btn sm" onClick={() => add(t)}>
                            <Plus className="lucide" aria-hidden="true" />
                            <I className="lucide" aria-hidden="true" /> {BLOCK_LABELS[t]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {sel && (
                  <div className="panel" id="inspector">
                    <BlockInspector block={sel} onChange={(nb) => updateContent({ ...content, blocks: content.blocks.map((b) => (b.id === nb.id ? nb : b)) })} disabled={disabled} />
                  </div>
                )}
              </>
            )}
            {tab === 'design' && (
              <div className="panel">
                <ThemeEditor theme={theme} onChange={updateTheme} disabled={disabled} locks={locks} onLocks={setLocks} onAi={canEdit ? () => setAnalysis(true) : undefined} />
                <ThemeHistory pageId={page.id} onApplied={adopt} canEdit={canEdit} />
              </div>
            )}
            {tab === 'seite' && (
              <>
                <div className="panel">
                  <PageSettings page={page} onSaved={adopt} canEdit={canEdit} />
                </div>
                <div className="panel">
                  <LegalEditor content={content} onChange={updateContent} disabled={disabled} />
                </div>
                {canEdit && (
                  <div className="panel">
                    <h2 className="h">Seite entfernen</h2>
                    <p className="muted" style={{ marginTop: 0 }}>Die Seite ist sofort nicht mehr öffentlich erreichbar. Sie bleibt 30 Tage im Papierkorb und lässt sich dort wiederherstellen.</p>
                    <button className="btn danger" onClick={() => confirmer.ask({ title: 'In den Papierkorb legen?', text: `„${page.name}“ ist danach sofort nicht mehr öffentlich erreichbar. Im Papierkorb bleibt die Seite 30 Tage wiederherstellbar.`, label: 'In den Papierkorb', danger: true }, () => trash.mutate())}>
                      In den Papierkorb
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <Preview content={content} theme={theme} publicUrl={publicUrl} />
        </div>
      )}

      {publishing && (
        <PublishDialog
          page={page}
          content={content}
          theme={theme}
          onClose={() => setPublishing(false)}
          onDone={(p) => {
            setPublishing(false);
            adopt(p);
            toast({ text: `Veröffentlicht als Version ${p.published?.number}.`, action: { label: 'Teilen', run: () => setTab('teilen') } });
          }}
        />
      )}
      {analysis && (
        <AnalysisFlow
          page={page}
          content={content}
          current={theme}
          locks={locks}
          onLocks={setLocks}
          onClose={() => setAnalysis(false)}
          onApply={async (t) => {
            if (timer.current) clearTimeout(timer.current);
            await flush();
            const p = await api.post<PageView>(`/api/v1/pages/${pageId}/theme`, { theme: t, source: 'ai', rev: rev.current });
            adopt(p);
            setAnalysis(false);
            toast({ text: 'Design in den Entwurf übernommen. Öffentlich wird es erst nach dem Veröffentlichen.' });
          }}
        />
      )}
      {confirmer.node}
      {conflict && (
        <Dialog
          title="Seite wurde an anderer Stelle geändert"
          onClose={() => setConflict(false)}
          footer={
            <>
              <button
                className="btn"
                onClick={async () => {
                  pending.current = null;
                  setConflict(false);
                  setSave('saved');
                  const p = await api.get<PageView>(`/api/v1/pages/${pageId}`);
                  adopt(p);
                }}
              >
                Neu laden (meine Änderungen verwerfen)
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  const p = await api.get<PageView>(`/api/v1/pages/${pageId}`);
                  rev.current = p.draft.rev;
                  setConflict(false);
                  await flush();
                }}
              >
                Meine Fassung behalten
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>{saveError}</p>
          <p className="muted">„Meine Fassung behalten“ überschreibt die andere Änderung mit Ihrem Stand.</p>
        </Dialog>
      )}
    </>
  );
}

function SaveIndicator({ state, error, onRetry, updatedAt }: { state: SaveState; error: string | null; onRetry: () => void; updatedAt: string }) {
  if (state === 'error')
    return (
      <span className="save err" role="alert">
        <span className="dot" /> Nicht gespeichert – <button className="btn ghost sm" onClick={onRetry} title={error ?? ''}>erneut versuchen</button>
      </span>
    );
  return (
    <span className={`save ${state === 'saved' ? '' : 'busy'}`} aria-live="polite">
      <span className="dot" /> {state === 'saved' ? `Gespeichert ${fmtRel(updatedAt)}` : state === 'saving' ? 'Speichert …' : 'Ungespeicherte Änderungen'}
    </span>
  );
}

function PageSettings({ page, onSaved, canEdit }: { page: PageView; onSaved: (p: PageView) => void; canEdit: boolean }) {
  const session = useSession();
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(page.slug);
  const m = useMutation({ mutationFn: () => api.patch<PageView>(`/api/v1/pages/${page.id}`, { name, slug, rev: page.draft.rev }), onSuccess: onSaved });
  const err = m.error as ApiError | null;
  const changed = name !== page.name || slug !== page.slug;
  return (
    <div>
      <h2 className="h">Name und Adresse</h2>
      <Field label="Name (nur intern)">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />}</Field>
      <Field label="Adresse" hint={`${session.publicBaseUrl}/${slug}`} error={err?.field === 'slug' ? err.message : null}>
        {(id) => <input id={id} className="input" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} aria-invalid={err?.field === 'slug'} />}
      </Field>
      {page.published && slug !== page.slug && <div className="callout warn" style={{ marginBottom: 12 }}>Achtung: Die alte Adresse funktioniert danach nicht mehr. Gedruckte Links und QR-Codes zeigen dann ins Leere.</div>}
      {err && !err.field && <ErrorBox error={err} />}
      {canEdit && (
        <button className="btn" disabled={!changed || m.isPending} onClick={() => m.mutate()}>
          {m.isPending && <Spinner />} Speichern
        </button>
      )}
    </div>
  );
}

function ThemeHistory({ pageId, onApplied, canEdit }: { pageId: number; onApplied: (p: PageView) => void; canEdit: boolean }) {
  const q = useQuery({ queryKey: ['theme-history', pageId], queryFn: () => api.get<{ id: number; source: string; createdAt: string; createdBy: string }[]>(`/api/v1/pages/${pageId}/theme-history`) });
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (hid: number) => api.post<PageView>(`/api/v1/pages/${pageId}/theme-history/${hid}/apply`),
    onSuccess: (p) => {
      onApplied(p);
      void qc.invalidateQueries({ queryKey: ['theme-history', pageId] });
    },
  });
  if (!q.data?.length) return null;
  return (
    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Frühere Entwurfsdesigns ({q.data.length})</summary>
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
        {q.data.slice(0, 10).map((h) => (
          <li key={h.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">
              {fmtDate(h.createdAt)} · {{ manual: 'manuell', preset: 'Voreinstellung', ai: 'KI-Vorschlag', history: 'Wiederhergestellt' }[h.source] ?? h.source}
            </span>
            {canEdit && (
              <button className="btn sm" onClick={() => m.mutate(h.id)} disabled={m.isPending}>
                Zurückholen
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Versions({ page, onRestored, canEdit }: { page: PageView; onRestored: (p: PageView) => void; canEdit: boolean }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['versions', page.id, page.published?.versionId], queryFn: () => api.get<Version[]>(`/api/v1/pages/${page.id}/versions`) });
  const [show, setShow] = useState<Version | null>(null);
  const confirmer = useConfirm();
  const m = useMutation({
    mutationFn: ({ v, mode }: { v: Version; mode: 'publish' | 'draft' }) => api.post<PageView>(`/api/v1/pages/${page.id}/versions/${v.id}/restore`, { mode, rev: page.draft.rev }),
    onSuccess: (p, { v, mode }) => {
      onRestored(p);
      toast({ text: mode === 'publish' ? `Version ${v.number} ist wieder öffentlich (als Version ${p.published?.number}).` : `Version ${v.number} in den Entwurf geladen.` });
    },
    onError: (e) => toast({ text: (e as Error).message, kind: 'bad' }),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.length) return <div className="empty"><h2>Noch keine Version</h2><p>Sobald Sie die Seite veröffentlichen, erscheint hier jede Version.</p></div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="t">
        <thead>
          <tr>
            <th>Version</th>
            <th>Veröffentlicht</th>
            <th>Notiz</th>
            <th>
              <span className="sr">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((v) => (
            <tr key={v.id}>
              <td>
                <b>{v.number}</b> {v.current && <span className="badge ok">öffentlich</span>}
              </td>
              <td>
                {fmtDate(v.publishedAt)}
                <div className="muted small">{v.publishedBy}</div>
              </td>
              <td>{v.note || <span className="muted">–</span>}</td>
              <td>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setShow(v)}>
                    Ansehen
                  </button>
                  {canEdit && !v.current && (
                    <>
                      <button className="btn sm" onClick={() => m.mutate({ v, mode: 'draft' })} disabled={m.isPending}>
                        In Entwurf laden
                      </button>
                      <button className="btn sm primary" onClick={() => confirmer.ask({ title: `Version ${v.number} wiederherstellen?`, text: `Version ${v.number} wird sofort wieder öffentlich (als neue Version). Ihr aktueller Entwurf bleibt unverändert.`, label: 'Wiederherstellen' }, () => m.mutate({ v, mode: 'publish' }))} disabled={m.isPending}>
                        Wiederherstellen
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirmer.node}
      {show && (
        <Dialog title={`Version ${show.number}`} onClose={() => setShow(null)} wide footer={<button className="btn" onClick={() => setShow(null)}>Schließen</button>}>
          <iframe title={`Version ${show.number}`} src={`/api/v1/pages/${page.id}/versions/${show.id}/preview`} sandbox="allow-same-origin" style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 8 }} />
        </Dialog>
      )}
    </div>
  );
}
