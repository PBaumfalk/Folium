import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Lock, Search, Send, Sparkles } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { PageContent } from '../../shared/content';
import { FONTS, type Theme } from '../../shared/theme';
import { api, ApiError, type PageView } from '../lib/api';
import { PreviewFrame, usePreviewHtml } from './Preview';
import type { Locks } from './ThemeEditor';
import { ErrorBox, Field, Spinner } from './ui';

interface Features {
  title: string;
  colors: { id: string; hex: string; source: string; role?: string }[];
  fonts: { id: string; family: string; source: string; usedFor: string[]; bundled: string | null }[];
  buttons: { id: string; selector: string; background: string | null; radius: string | null }[];
  logo: { id: string; url: string; kind: string }[];
  notes: string[];
  density: string;
}
interface AnalyzeResult {
  analysisId: string;
  url: string;
  features: Features;
  screenshots: { desktop: string; mobile: string } | null;
  transfer: { url: string; provider: string | null; model: string | null; featureCount: number; textChars: number; images: number; estInputTokens: number; estCostEur: number };
  aiConfigured: boolean;
  simulated: boolean;
}
interface Variant {
  name: string;
  rationale: string;
  theme: Theme;
  provenance: Record<string, 'erkannt' | 'vorgeschlagen'>;
  notes: string[];
}
interface Proposal {
  identity: { summary: string; character: string[] };
  detected: { colors: { featureId: string; role: string; hex: string; source: string }[]; fonts: { featureId: string; role: string; family: string; bundled: string | null; source: string }[]; buttons: { featureId: string; note: string; selector: string }[]; logo: { featureId: string; url: string } | null };
  uncertain: string[];
  variants: Variant[];
}
interface ProposeResult {
  proposal: Proposal;
  simulated: boolean;
  model: string;
  fallbackModel?: string | null;
  cached: boolean;
  costEur: number;
}

type Step = 'url' | 'analyzing' | 'review' | 'proposing' | 'result';

const ROLE: Record<string, string> = { background: 'Hintergrund', surface: 'Fläche', text: 'Text', muted: 'Nebentext', accent: 'Akzent', onAccent: 'Text auf Akzent', border: 'Linie', other: 'Weitere', heading: 'Überschriften', body: 'Fließtext', button: 'Knöpfe' };

function Swatch({ hex }: { hex: string }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 5, background: hex, border: '1px solid var(--line-2)', verticalAlign: '-4px', marginRight: 6 }} />;
}

function VariantCard({ v, content, onApply, busy }: { v: Variant; content: PageContent; onApply: () => void; busy: boolean }) {
  const { html } = usePreviewHtml(content, v.theme, '');
  const proposed = Object.entries(v.provenance).filter(([, p]) => p === 'vorgeschlagen').map(([k]) => ROLE[k] ?? k);
  return (
    <article className="card" style={{ padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
      <div style={{ display: 'grid', justifyItems: 'center', background: 'var(--panel-2)', borderRadius: 10, padding: 10, overflow: 'hidden' }}>
        <div style={{ zoom: 0.78 }}>
        {html ? <PreviewFrame html={html} mode="mobile" title={`Vorschau ${v.name}`} height={640} /> : <div className="skeleton" style={{ width: 390, height: 640 }} />}
        </div>
      </div>
      <h3 style={{ margin: 0, font: '500 20px/1.2 var(--serif)' }}>{v.name}</h3>
      <p style={{ margin: 0 }}>{v.rationale}</p>
      <div className="small muted">
        Schriften: {FONTS[v.theme.fonts.heading as keyof typeof FONTS]?.family ?? 'eigene'} / {FONTS[v.theme.fonts.body as keyof typeof FONTS]?.family ?? 'eigene'}
      </div>
      <div className="row small">
        {(['background', 'text', 'accent', 'surface'] as const).map((k) => (
          <span key={k} title={`${ROLE[k]}: ${v.theme.colors[k]} (${v.provenance[k]})`}>
            <Swatch hex={v.theme.colors[k]} />
            {v.provenance[k] === 'erkannt' ? <span className="badge ok">erkannt</span> : <span className="badge">Vorschlag</span>}
          </span>
        ))}
      </div>
      {proposed.length > 0 && <p className="small muted" style={{ margin: 0 }}>Nicht auf der Homepage gefunden, sondern vorgeschlagen: {proposed.join(', ')}.</p>}
      {v.notes.length > 0 && (
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {v.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <button className="btn primary" onClick={onApply} disabled={busy}>
        <Check className="lucide" aria-hidden="true" /> Variante übernehmen
      </button>
    </article>
  );
}

export function AnalysisFlow({ page, content, current, locks, onClose, onApply }: { page: PageView; content: PageContent; current: Theme; locks: Locks; onLocks: (l: Locks) => void; onClose: () => void; onApply: (t: Theme) => Promise<void> }) {
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ homepageUrl: string }>('/api/v1/settings').catch(() => ({ homepageUrl: '' })) });
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('url');
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [result, setResult] = useState<ProposeResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [applying, setApplying] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const effUrl = url || settings.data?.homepageUrl || '';

  const analyze = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setStep('analyzing');
    abort.current = new AbortController();
    try {
      setAnalysis(await api.post<AnalyzeResult>('/api/v1/design/analyze', { url: effUrl }, abort.current.signal));
      setStep('review');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return setStep('url');
      setError(err as ApiError);
      setStep('url');
    }
  };
  const propose = async (force = false) => {
    if (!analysis) return;
    setError(null);
    setStep('proposing');
    abort.current = new AbortController();
    try {
      setResult(await api.post<ProposeResult>(`/api/v1/design/analyses/${analysis.analysisId}/propose`, { pageId: page.id, locked: [...locks], current, force }, abort.current.signal));
      setStep('result');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return setStep('review');
      setError(err as ApiError);
      setStep(result ? 'result' : 'review');
    }
  };
  const cancel = () => abort.current?.abort();

  return (
    <div className="backdrop" style={{ alignItems: 'start', overflow: 'auto' }}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="af-title" style={{ width: 'min(1320px,100%)', maxHeight: 'none' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="af-title" style={{ margin: 0 }}>
            Design aus Homepage übernehmen
          </h2>
          <button className="btn ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
        <ol className="row small muted" style={{ listStyle: 'none', padding: 0, margin: '10px 0 18px', gap: 14 }} aria-label="Schritte">
          {[
            ['url', '1 Adresse'],
            ['review', '2 Übertragung prüfen'],
            ['result', '3 Varianten vergleichen'],
          ].map(([s, l]) => (
            <li key={s} style={{ fontWeight: step.startsWith(s.slice(0, 3)) || (s === 'url' && step === 'analyzing') || (s === 'review' && step === 'proposing') ? 700 : 400, color: 'var(--ink-2)' }}>
              {l}
            </li>
          ))}
        </ol>
        {error && (
          <div style={{ marginBottom: 14 }}>
            <ErrorBox error={error} />
            {(error.details as { label?: string } | undefined)?.label && <p className="small muted">Grund: {(error.details as { label: string }).label}</p>}
          </div>
        )}

        {step === 'url' && (
          <form onSubmit={analyze} style={{ maxWidth: 640 }}>
            <p style={{ marginTop: 0 }}>Folium lädt die Homepage, liest Farben, Schriften, Knöpfe und Logo aus dem HTML und CSS und macht – wenn eingerichtet – Bildschirmfotos. Dabei wird noch nichts an die KI gesendet.</p>
            <Field label="Adresse der Homepage">{(id) => <input id={id} className="input" value={effUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com/" inputMode="url" />}</Field>
            <button className="btn primary" disabled={!effUrl.trim()}>
              <Search className="lucide" aria-hidden="true" /> Homepage untersuchen
            </button>
          </form>
        )}

        {(step === 'analyzing' || step === 'proposing') && (
          <div className="empty" role="status" aria-live="polite">
            <Spinner />
            <h2 style={{ marginTop: 12 }}>{step === 'analyzing' ? 'Homepage wird untersucht' : 'Designvorschläge werden erstellt'}</h2>
            <p>{step === 'analyzing' ? 'Seite, Stylesheets und Bildschirmfotos werden abgesichert geladen. Das dauert meist 5 bis 20 Sekunden.' : 'Die KI wertet Merkmale und Bildschirmfotos aus. Das dauert meist 20 bis 90 Sekunden.'}</p>
            <button className="btn" onClick={cancel}>
              Abbrechen
            </button>
          </div>
        )}

        {step === 'review' && analysis && (
          <div style={{ display: 'grid', gap: 16 }}>
            {analysis.simulated && <div className="callout warn">Simulierte KI-Antwort: In dieser Umgebung ist ein Testanbieter eingestellt (AI_PROVIDER=fake). Es wird keine echte KI aufgerufen.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', gap: 16 }} className="af-grid">
              <section className="card">
                <h3 className="h">Erkannt auf der Homepage</h3>
                <p className="small muted" style={{ marginTop: 0 }}>
                  {analysis.features.title} · {analysis.url}
                </p>
                <table className="t">
                  <tbody>
                    {analysis.features.colors.slice(0, 10).map((c) => (
                      <tr key={c.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Swatch hex={c.hex} />
                          <code>{c.hex}</code>
                        </td>
                        <td className="small muted">{c.source}</td>
                      </tr>
                    ))}
                    {analysis.features.fonts.slice(0, 4).map((f) => (
                      <tr key={f.id}>
                        <td>
                          <b>{f.family}</b>
                        </td>
                        <td className="small muted">
                          {f.usedFor.map((u) => ROLE[u] ?? u).join(', ') || 'Verwendung unklar'} · {f.bundled ? 'mitgeliefert' : 'nicht mitgeliefert – würde ersetzt oder müsste hochgeladen werden'}
                        </td>
                      </tr>
                    ))}
                    {analysis.features.logo.slice(0, 2).map((l) => (
                      <tr key={l.id}>
                        <td>Logo ({l.kind})</td>
                        <td className="small muted" style={{ wordBreak: 'break-all' }}>
                          {l.url}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analysis.features.notes.length > 0 && (
                  <ul className="small muted" style={{ paddingLeft: 18 }}>
                    {analysis.features.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="card" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
                <h3 className="h" style={{ margin: 0 }}>
                  Bitte prüfen, was übertragen wird
                </h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Adresse: {analysis.transfer.url}</li>
                  <li>{analysis.transfer.featureCount} ausgelesene Merkmale (Farben, Schriften, Knöpfe, Logo-Adressen)</li>
                  <li>Textauszug der Homepage: {analysis.transfer.textChars.toLocaleString('de-DE')} Zeichen</li>
                  <li>{analysis.transfer.images ? `${analysis.transfer.images} Bildschirmfotos (Desktop und Smartphone)` : 'Keine Bildschirmfotos'}</li>
                  <li>Name, Kurzbeschreibung und Art der Einträge Ihrer Linkseite (keine weiteren Inhalte)</li>
                </ul>
                <p className="small muted" style={{ margin: 0 }}>
                  Empfänger: {analysis.transfer.provider === 'anthropic' ? `Anthropic (Modell ${analysis.transfer.model})` : analysis.transfer.provider === 'fake' ? 'niemand (simuliert)' : 'kein Anbieter eingerichtet'}. Geschätzte Kosten: ca. {analysis.transfer.estCostEur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}.
                </p>
                {analysis.screenshots && (
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <img src={analysis.screenshots.desktop} alt="Bildschirmfoto Desktop" style={{ width: '62%', borderRadius: 6, border: '1px solid var(--line)' }} />
                    <img src={analysis.screenshots.mobile} alt="Bildschirmfoto Smartphone" style={{ width: '30%', borderRadius: 6, border: '1px solid var(--line)' }} />
                  </div>
                )}
                {locks.size > 0 && (
                  <p className="small" style={{ margin: 0 }}>
                    <Lock className="lucide" aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px' }} /> Festgehalten: {[...locks].join(', ')}
                  </p>
                )}
                {analysis.aiConfigured ? (
                  <button className="btn primary" onClick={() => void propose()}>
                    <Send className="lucide" aria-hidden="true" /> An {analysis.transfer.provider === 'fake' ? 'Testanbieter' : 'Claude'} senden
                  </button>
                ) : (
                  <div className="callout warn">
                    <AlertTriangle className="lucide" aria-hidden="true" />
                    <span>Die KI ist nicht eingerichtet. Sie können das Design unten manuell anpassen und die erkannten Farben links übernehmen.</span>
                  </div>
                )}
                <button className="btn ghost" onClick={() => setStep('url')}>
                  Andere Adresse
                </button>
              </section>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div style={{ display: 'grid', gap: 16 }}>
            {result.simulated && <div className="callout warn">Simulierte KI-Antwort (Testanbieter). Die Varianten sind Beispieldaten, nicht von einer echten KI.</div>}
            {result.cached && <div className="callout info">Ergebnis aus den letzten 24 Stunden wiederverwendet (keine neuen Kosten). „Weitere Varianten erzeugen“ fragt neu an.</div>}
            <section className="card">
              <h3 className="h">
                <Sparkles className="lucide" aria-hidden="true" style={{ verticalAlign: '-3px' }} /> Visuelle Identität
              </h3>
              <p style={{ marginTop: 0 }}>{result.proposal.identity.summary}</p>
              <div className="row">
                {result.proposal.identity.character.map((c) => (
                  <span key={c} className="badge">
                    {c}
                  </span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 14 }}>
                <div>
                  <h4 style={{ margin: '0 0 6px' }}>Erkannt auf der Homepage</h4>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {result.proposal.detected.colors.map((c) => (
                      <li key={c.featureId}>
                        <Swatch hex={c.hex} />
                        {ROLE[c.role] ?? c.role}: <code>{c.hex}</code> <span className="muted">({c.source})</span>
                      </li>
                    ))}
                    {result.proposal.detected.fonts.map((f) => (
                      <li key={f.featureId}>
                        {ROLE[f.role] ?? f.role}: <b>{f.family}</b> {f.bundled ? '' : <span className="muted">(nicht mitgeliefert)</span>}
                      </li>
                    ))}
                    {result.proposal.detected.buttons.map((b) => (
                      <li key={b.featureId}>Knopf: {b.note}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px' }}>Unsicher oder nicht verfügbar</h4>
                  {result.proposal.uncertain.length ? (
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {result.proposal.uncertain.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small muted">Keine Hinweise.</p>
                  )}
                </div>
              </div>
            </section>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
              {result.proposal.variants.map((v, i) => (
                <VariantCard
                  key={i}
                  v={v}
                  content={content}
                  busy={applying}
                  onApply={async () => {
                    setApplying(true);
                    try {
                      await onApply(v.theme);
                    } catch (e) {
                      setError(e as ApiError);
                    } finally {
                      setApplying(false);
                    }
                  }}
                />
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small muted">
                Modell: {result.model}
                {result.fallbackModel ? ` (Ersatzmodell nach Ablehnung)` : ''} · Kosten dieses Aufrufs: ca. {result.costEur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3 })}
              </span>
              <button className="btn" onClick={() => void propose(true)}>
                <Sparkles className="lucide" aria-hidden="true" /> Weitere Varianten erzeugen
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Die Übernahme ändert nur den Entwurf. Öffentlich wird das Design erst, wenn Sie veröffentlichen. Werte, die Sie im Design-Editor mit dem Schloss festhalten, bleiben bei neuen Varianten erhalten.</p>
          </div>
        )}
      </div>
    </div>
  );
}
