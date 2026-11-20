import { useQuery } from '@tanstack/react-query';
import { Download, Info } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { PageContent } from '../../shared/content';
import { ErrorBox, Field, Loading } from '../components/ui';
import { api, type PageView } from '../lib/api';

interface StatsData {
  from: string;
  to: string;
  enabled: boolean;
  retentionDays: number;
  totals: { views: number; clicks: number; bots: number };
  days: { day: string; views: number; clicks: number }[];
  sources: { source: string; views: number; clicks: number }[];
  pages: { pageId: number; name: string; views: number; clicks: number }[];
  blocks: { pageId: number; blockId: string; title: string; clicks: number; ctr: number | null }[];
}

const nf = new Intl.NumberFormat('de-DE');
const dShort = (iso: string) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const dLong = (iso: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** Säulendiagramm einer Kennzahl je Tag, mit Hover- und Fokus-Tooltip. */
function DayBars({ data, field, label }: { data: StatsData['days']; field: 'views' | 'clicks'; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const W = 640;
  const H = 150;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => d[field]));
  const nice = (() => {
    const p = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / p) * p;
  })();
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const every = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;
  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      <figcaption className="h" id={id} style={{ fontWeight: 600, marginBottom: 6 }}>
        {label} pro Tag
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby={id} style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(nice * f) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-3)">
              {nf.format(Math.round(nice * f))}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = d[field];
          const x = pad.l + i * bw;
          const top = y(v);
          const bh = Math.max(v > 0 ? 2 : 0, H - pad.b - top);
          const w = Math.max(1, bw - 2);
          return (
            <g key={d.day}>
              {bh > 0 && <path d={`M${x + 1},${H - pad.b} V${H - pad.b - bh + Math.min(4, bh)} q0,-${Math.min(4, bh)} ${Math.min(4, w / 2)},-${Math.min(4, bh)} H${x + 1 + w - Math.min(4, w / 2)} q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, bh)} V${H - pad.b} Z`} fill="var(--leaf)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" tabIndex={0} aria-label={`${dLong(d.day)}: ${nf.format(v)} ${label}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
                  {dShort(d.day)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line-2)" />
      </svg>
      {h && (
        <div role="status" style={{ position: 'absolute', top: 24, left: `${((pad.l + (hover! + 0.5) * bw) / W) * 100}%`, transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--bg)', padding: '6px 10px', borderRadius: 8, fontSize: 12.5, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: 'var(--shadow)' }}>
          {dLong(h.day)}
          <br />
          <b>{nf.format(h[field])}</b> {label}
        </div>
      )}
    </figure>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted small" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ font: '500 32px/1.1 var(--serif)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

export function StatsView({ pageId, showPages }: { pageId?: number; showPages?: boolean }) {
  const [range, setRange] = useState<'7' | '30' | '90' | 'eigen'>('30');
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (pageId) p.set('pageId', String(pageId));
    if (range === 'eigen') {
      p.set('from', from);
      p.set('to', to);
    } else p.set('days', range);
    return p.toString();
  }, [pageId, range, from, to]);
  const q = useQuery({ queryKey: ['stats', qs], queryFn: () => api.get<StatsData>(`/api/v1/stats?${qs}`) });
  const d = q.data;
  const ctr = d && d.totals.views ? `${nf.format(Math.round((d.totals.clicks / d.totals.views) * 1000) / 10)} %` : '–';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <div className="seg" role="group" aria-label="Zeitraum">
            {(['7', '30', '90'] as const).map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                {r} Tage
              </button>
            ))}
            <button aria-pressed={range === 'eigen'} onClick={() => setRange('eigen')}>
              Eigener Zeitraum
            </button>
          </div>
          {range === 'eigen' && (
            <div className="row">
              <Field label="Von">{(id) => <input id={id} type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="Bis">{(id) => <input id={id} type="date" className="input" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />}</Field>
            </div>
          )}
        </div>
        <div className="row">
          <a className="btn sm" href={`/api/v1/stats.csv?${qs}`} download>
            <Download className="lucide" aria-hidden="true" /> Tage als CSV
          </a>
          <a className="btn sm" href={`/api/v1/stats.csv?${qs}&type=links`} download>
            <Download className="lucide" aria-hidden="true" /> Links als CSV
          </a>
        </div>
      </div>
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {d && !d.enabled && <div className="callout warn">Die Statistik ist in den Einstellungen abgeschaltet. Es werden keine neuen Aufrufe gezählt.</div>}
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            <Tile label="Seitenaufrufe" value={nf.format(d.totals.views)} sub={`${dShort(d.from)} bis ${dShort(d.to)}`} />
            <Tile label="Linkklicks" value={nf.format(d.totals.clicks)} />
            <Tile label="Klicks je Aufruf" value={ctr} />
            <Tile label="Bots und Vorschauen" value={nf.format(d.totals.bots)} sub="nicht in den Summen enthalten" />
          </div>
          {d.totals.views === 0 && d.totals.clicks === 0 ? (
            <div className="empty">
              <h2>Noch keine Aufrufe</h2>
              <p>Sobald die Seite veröffentlicht ist und besucht wird, erscheinen hier die Zahlen. Mit „?src=qr“ oder „?src=flyer“ an der Adresse sehen Sie, woher Besucher kommen.</p>
            </div>
          ) : (
            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24 }}>
              <DayBars data={d.days} field="views" label="Aufrufe" />
              <DayBars data={d.days} field="clicks" label="Klicks" />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, alignItems: 'start' }}>
            <div className="card" style={{ padding: 0 }}>
              <h2 className="h" style={{ padding: '14px 16px 0' }}>
                Klicks je Eintrag
              </h2>
              {d.blocks.length === 0 ? (
                <p className="muted" style={{ padding: '0 16px 12px' }}>Noch keine Klicks im Zeitraum.</p>
              ) : (
                <table className="t">
                  <thead>
                    <tr>
                      <th>Eintrag</th>
                      {showPages && <th>Seite</th>}
                      <th className="num">Klicks</th>
                      <th className="num">je Aufruf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.blocks.map((b) => {
                      const maxC = d.blocks[0].clicks || 1;
                      return (
                        <tr key={`${b.pageId}-${b.blockId}`}>
                          <td>
                            {b.title}
                            <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: 'var(--leaf)', width: `${(b.clicks / maxC) * 100}%`, marginTop: 6, opacity: 0.85 }} />
                          </td>
                          {showPages && <td>{d.pages.find((p) => p.pageId === b.pageId)?.name}</td>}
                          <td className="num">{nf.format(b.clicks)}</td>
                          <td className="num">{b.ctr === null ? '–' : `${nf.format(b.ctr)} %`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              {showPages && d.pages.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                  <h2 className="h" style={{ padding: '14px 16px 0' }}>
                    Seiten
                  </h2>
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Seite</th>
                        <th className="num">Aufrufe</th>
                        <th className="num">Klicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.pages.map((p) => (
                        <tr key={p.pageId}>
                          <td>
                            <Link to={`/seiten/${p.pageId}/statistik`}>{p.name}</Link>
                          </td>
                          <td className="num">{nf.format(p.views)}</td>
                          <td className="num">{nf.format(p.clicks)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="card" style={{ padding: 0 }}>
                <h2 className="h" style={{ padding: '14px 16px 0' }}>
                  Quellen
                </h2>
                {d.sources.length === 0 ? (
                  <p className="muted" style={{ padding: '0 16px 12px' }}>Keine Daten.</p>
                ) : (
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Quelle</th>
                        <th className="num">Aufrufe</th>
                        <th className="num">Klicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.sources.map((s) => (
                        <tr key={s.source}>
                          <td>{s.source === 'direkt' ? 'Direkt / unbekannt' : s.source === 'qr' ? 'QR-Code' : s.source}</td>
                          <td className="num">{nf.format(s.views)}</td>
                          <td className="num">{nf.format(s.clicks)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
          <CountingNote retention={d.retentionDays} />
        </>
      )}
    </div>
  );
}

function CountingNote({ retention }: { retention: number }) {
  return (
    <details className="card">
      <summary style={{ cursor: 'pointer', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Info className="lucide" aria-hidden="true" /> So zählt Folium
      </summary>
      <div style={{ maxWidth: '70ch' }}>
        <p>
          <b>Aufrufe</b> zählt der Server, wenn er eine veröffentlichte Seite ausliefert. <b>Klicks</b> meldet die Seite beim Antippen eines Eintrags mit einer kleinen Nachricht ohne Cookie. Der Link selbst führt direkt zum Ziel und funktioniert auch, wenn die Zählung ausfällt.
        </p>
        <p>Gespeichert werden nur Tagessummen je Seite, Eintrag und Quelle. Folium speichert keine IP-Adressen, keine Geräte- oder Browserangaben und keine Besucherkennungen. Die Zahlen sind deshalb Aufrufe, keine Personen: Wer die Seite zweimal öffnet, zählt doppelt.</p>
        <p>Grenzen: Klicks von Besuchern mit Werbe- oder Skriptblocker fehlen. Bots und Link-Vorschauen (z. B. WhatsApp, LinkedIn) werden erkannt, soweit sie sich zu erkennen geben, und getrennt ausgewiesen. Die Zählung kann bis zu drei Sekunden verzögert sein. Tagessummen werden nach {retention} Tagen gelöscht.</p>
        <p>Weitere Quellen mit eigenen Zahlen: die Zugriffsprotokolle des Reverse Proxy (z. B. Caddy, dort mit IP-Adressen und eigener Aufbewahrung), Filum für Kurzlinks und Tessera für QR-Codes. Diese Zahlen weichen von Folium ab, weil sie anders zählen.</p>
      </div>
    </details>
  );
}

export function StatsPage() {
  const pages = useQuery({ queryKey: ['pages'], queryFn: () => api.get<PageView[]>('/api/v1/pages') });
  const [pageId, setPageId] = useState<number | undefined>(undefined);
  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">Statistik</h1>
          <p className="sub">Aufrufe und Linkklicks aller Seiten, ohne Besucherkennungen.</p>
        </div>
        <Field label="Seite">
          {(id) => (
            <select id={id} className="input" value={pageId ?? ''} onChange={(e) => setPageId(e.target.value ? Number(e.target.value) : undefined)} style={{ minWidth: 220 }}>
              <option value="">Alle Seiten</option>
              {pages.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <StatsView pageId={pageId} showPages={!pageId} />
    </>
  );
}

export function PageStats({ pageId }: { pageId: number; content: PageContent }) {
  return <StatsView pageId={pageId} />;
}
