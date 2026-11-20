import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plug, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useParams } from 'react-router';
import { PRESET_LABELS, type PresetId } from '../../shared/theme';
import { useCan, useSession } from '../App';
import { ErrorBox, Field, fmtDate, Loading, Spinner, useConfirm, useToast } from '../components/ui';
import { api, ApiError, type PageView, type User } from '../lib/api';

interface Settings {
  imprintUrl: string;
  privacyUrl: string;
  homepageUrl: string;
  defaultPreset: PresetId;
  statsEnabled: boolean;
  statsRetentionDays: number;
  trashDays: number;
}

const SECTIONS: [string, string, 'viewer' | 'editor' | 'admin'][] = [
  ['allgemein', 'Allgemein', 'viewer'],
  ['domains', 'Domains', 'viewer'],
  ['konten', 'Konten', 'admin'],
  ['ki', 'KI und Verbindungen', 'editor'],
  ['daten', 'Sicherung und Export', 'editor'],
];

export function SettingsPage() {
  const { section = 'allgemein' } = useParams();
  const isAdmin = useCan('admin');
  const isEditor = useCan('editor');
  const allowed = (r: string) => r === 'viewer' || (r === 'editor' && isEditor) || (r === 'admin' && isAdmin);
  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">Einstellungen</h1>
          <p className="sub">Vorgaben für alle Seiten, Domains, Konten, KI und Sicherungen.</p>
        </div>
      </div>
      <div className="tabs" role="navigation" aria-label="Bereiche der Einstellungen">
        {SECTIONS.filter((s) => allowed(s[2])).map(([id, label]) => (
          <NavLink key={id} to={`/einstellungen/${id}`} className={({ isActive }) => (isActive || (id === 'allgemein' && section === 'allgemein') ? 'active' : '')} style={{ padding: '10px 14px', fontWeight: 600, color: section === id ? 'var(--ink)' : 'var(--ink-3)', borderBottom: section === id ? '2px solid var(--leaf)' : '2px solid transparent', textDecoration: 'none', marginBottom: -1 }}>
            {label}
          </NavLink>
        ))}
      </div>
      <div style={{ maxWidth: 900 }}>
        {section === 'allgemein' && <General />}
        {section === 'domains' && <Domains />}
        {section === 'konten' && isAdmin && <Users />}
        {section === 'ki' && isEditor && <Ai />}
        {section === 'daten' && isEditor && <Data />}
      </div>
    </>
  );
}

function General() {
  const qc = useQueryClient();
  const toast = useToast();
  const isAdmin = useCan('admin');
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/v1/settings') });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  const m = useMutation({
    mutationFn: () => api.patch<Settings>('/api/v1/settings', s),
    onSuccess: (d) => {
      qc.setQueryData(['settings'], d);
      toast({ text: 'Einstellungen gespeichert.' });
    },
  });
  if (!s) return <Loading />;
  const err = m.error as ApiError | null;
  const fe = (f: string) => (err?.field === f ? err.message : null);
  const d = !isAdmin;
  return (
    <div className="card">
      <h2 className="h">Pflichtangaben für neue Seiten</h2>
      <Field label="Impressum" error={fe('imprintUrl')}>{(id) => <input id={id} className="input" value={s.imprintUrl} onChange={(e) => setS({ ...s, imprintUrl: e.target.value })} disabled={d} />}</Field>
      <Field label="Datenschutzerklärung" error={fe('privacyUrl')} hint="Die Datenschutzerklärung sollte den Abschnitt zu Folium enthalten (Textbaustein im Handbuch, Kapitel Datenschutz).">
        {(id) => <input id={id} className="input" value={s.privacyUrl} onChange={(e) => setS({ ...s, privacyUrl: e.target.value })} disabled={d} />}
      </Field>
      <Field label="Homepage (Vorgabe für „Design aus Homepage“)" error={fe('homepageUrl')}>{(id) => <input id={id} className="input" value={s.homepageUrl} onChange={(e) => setS({ ...s, homepageUrl: e.target.value })} disabled={d} />}</Field>
      <Field label="Standard-Designrichtung">
        {(id) => (
          <select id={id} className="input" value={s.defaultPreset} onChange={(e) => setS({ ...s, defaultPreset: e.target.value as PresetId })} disabled={d}>
            {(Object.keys(PRESET_LABELS) as PresetId[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p].name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <h2 className="h" style={{ marginTop: 18 }}>
        Statistik und Aufbewahrung
      </h2>
      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={s.statsEnabled} onChange={(e) => setS({ ...s, statsEnabled: e.target.checked })} disabled={d} /> Aufrufe und Klicks zählen (nur Tagessummen, keine Besucherdaten)
      </label>
      <div className="two">
        <Field label="Statistik aufbewahren (Tage)">{(id) => <input id={id} type="number" min={30} max={3650} className="input" value={s.statsRetentionDays} onChange={(e) => setS({ ...s, statsRetentionDays: Number(e.target.value) })} disabled={d} />}</Field>
        <Field label="Papierkorb leeren nach (Tagen)">{(id) => <input id={id} type="number" min={1} max={365} className="input" value={s.trashDays} onChange={(e) => setS({ ...s, trashDays: Number(e.target.value) })} disabled={d} />}</Field>
      </div>
      {err && !err.field && <ErrorBox error={err} />}
      {isAdmin && (
        <button className="btn primary" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending && <Spinner />} Speichern
        </button>
      )}
    </div>
  );
}

function Domains() {
  const qc = useQueryClient();
  const session = useSession();
  const isAdmin = useCan('admin');
  const q = useQuery({ queryKey: ['domains'], queryFn: () => api.get<{ id: number; host: string; pageId: number | null; pageName: string | null }[]>('/api/v1/domains') });
  const pages = useQuery({ queryKey: ['pages'], queryFn: () => api.get<PageView[]>('/api/v1/pages') });
  const [host, setHost] = useState('');
  const [pageId, setPageId] = useState<number | ''>('');
  const add = useMutation({
    mutationFn: () => api.post('/api/v1/domains', { host, pageId: pageId || null }),
    onSuccess: () => {
      setHost('');
      void qc.invalidateQueries({ queryKey: ['domains'] });
    },
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/v1/domains/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }) });
  const err = add.error as ApiError | null;
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>
        Alle Seiten sind unter <b>{session.publicBaseUrl}/&lt;adresse&gt;</b> erreichbar. Zusätzlich kann eine eigene Domain direkt auf eine Seite zeigen, z. B. <code>links.maria-muster.de</code> → Seite einer Person.
      </p>
      {q.isLoading ? (
        <Loading lines={1} />
      ) : q.data?.length ? (
        <table className="t" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Domain</th>
              <th>zeigt auf</th>
              <th>
                  <span className="sr">Aktionen</span>
                </th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((d) => (
              <tr key={d.id}>
                <td>{d.host}</td>
                <td>{d.pageName ?? <span className="muted">keine Seite (nur Adressen mit Pfad)</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  {isAdmin && (
                    <button className="btn ghost icon sm" aria-label={`${d.host} entfernen`} onClick={() => del.mutate(d.id)}>
                      <Trash2 className="lucide" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Noch keine eigene Domain eingetragen.</p>
      )}
      {isAdmin && (
        <>
          <div className="two">
            <Field label="Domain" error={err?.field === 'host' ? err.message : null}>{(id) => <input id={id} className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="links.beispiel.de" />}</Field>
            <Field label="Startseite der Domain">
              {(id) => (
                <select id={id} className="input" value={pageId} onChange={(e) => setPageId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Keine</option>
                  {pages.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <button className="btn" onClick={() => add.mutate()} disabled={!host || add.isPending}>
            <Plus className="lucide" aria-hidden="true" /> Domain eintragen
          </button>
          <p className="small muted">DNS und TLS-Zertifikat richtet die IT im Reverse Proxy ein (Handbuch, Kapitel Caddy). Folium liefert die Seite aus, sobald Anfragen für die Domain ankommen.</p>
        </>
      )}
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const session = useSession();
  const confirmer = useConfirm();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/v1/users') });
  const [n, setN] = useState({ email: '', name: '', role: 'editor' as User['role'], password: '' });
  const add = useMutation({
    mutationFn: () => api.post('/api/v1/users', n),
    onSuccess: () => {
      setN({ email: '', name: '', role: 'editor', password: '' });
      void qc.invalidateQueries({ queryKey: ['users'] });
      toast({ text: 'Konto angelegt. Bitte das Passwort auf sicherem Weg weitergeben.' });
    },
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<User> }) => api.patch(`/api/v1/users/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError: (e) => toast({ text: (e as Error).message, kind: 'bad' }) });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/v1/users/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError: (e) => toast({ text: (e as Error).message, kind: 'bad' }) });
  const err = add.error as ApiError | null;
  return (
    <div className="card">
      {q.isLoading && <Loading />}
      {q.data && (
        <table className="t" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th>Konto</th>
              <th>Rolle</th>
              <th>Zuletzt angemeldet</th>
              <th>
                  <span className="sr">Aktionen</span>
                </th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name || u.email}</b>
                  <div className="small muted">
                    {u.email}
                    {u.sso ? ' · authentik' : ''}
                    {u.disabled ? ' · gesperrt' : ''}
                  </div>
                </td>
                <td>
                  <select className="input" aria-label={`Rolle von ${u.email}`} value={u.role} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value as User['role'] } })} disabled={u.id === session.user?.id}>
                    <option value="admin">Admin</option>
                    <option value="editor">Redaktion</option>
                    <option value="viewer">Ansehen</option>
                  </select>
                </td>
                <td className="small">{fmtDate(u.lastLoginAt)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {u.id !== session.user?.id && (
                    <>
                      <button className="btn sm" onClick={() => patch.mutate({ id: u.id, body: { disabled: !u.disabled } })}>
                        {u.disabled ? 'Entsperren' : 'Sperren'}
                      </button>{' '}
                      <button className="btn ghost icon sm" aria-label={`${u.email} löschen`} onClick={() => confirmer.ask({ title: 'Konto löschen?', text: `${u.email} kann sich danach nicht mehr anmelden.`, label: 'Löschen', danger: true }, () => del.mutate(u.id))}>
                        <Trash2 className="lucide" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 className="h">Konto anlegen</h2>
      <div className="two">
        <Field label="E-Mail" error={err?.field === 'email' ? err.message : null}>{(id) => <input id={id} className="input" type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />}</Field>
        <Field label="Name">{(id) => <input id={id} className="input" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />}</Field>
        <Field label="Rolle" hint="Redaktion: Seiten bearbeiten, veröffentlichen, KI nutzen. Ansehen: nur lesen.">
          {(id) => (
            <select id={id} className="input" value={n.role} onChange={(e) => setN({ ...n, role: e.target.value as User['role'] })}>
              <option value="editor">Redaktion</option>
              <option value="viewer">Ansehen</option>
              <option value="admin">Admin</option>
            </select>
          )}
        </Field>
        <Field label="Erstes Passwort" hint="Mindestens 12 Zeichen." error={err?.field === 'password' ? err.message : null}>
          {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} />}
        </Field>
      </div>
      {err && !err.field && <ErrorBox error={err} />}
      <button className="btn primary" onClick={() => add.mutate()} disabled={add.isPending || !n.email || !n.password}>
        <Plus className="lucide" aria-hidden="true" /> Konto anlegen
      </button>
      {confirmer.node}
    </div>
  );
}

function Ai() {
  const session = useSession();
  const isAdmin = useCan('admin');
  const q = useQuery({ queryKey: ['ai-settings'], queryFn: () => api.get<{ configured: boolean; provider: string; model: string; simulated: boolean; browser: boolean; usage: { monthEur: number; monthRuns: number; todayRuns: number; dailyLimit: number; hourlyPerUser: number; monthlyBudgetEur: number }; recent: { at: string; model: string; status: string; cost_eur: number; ms: number; error: string | null; simulated: boolean }[] }>('/api/v1/settings/ai') });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>('/api/v1/settings/ai/test') });
  const d = q.data;
  const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <h2 className="h">KI für „Design aus Homepage“</h2>
        {!d ? (
          <Loading lines={2} />
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              {d.configured ? (
                <>
                  <span className={`badge ${d.simulated ? 'sim' : 'ok'}`}>{d.simulated ? 'Simuliert' : 'Eingerichtet'}</span> Anbieter: {d.provider === 'anthropic' ? 'Anthropic Claude' : d.provider}, Modell <code>{d.model}</code>
                </>
              ) : (
                <>
                  <span className="badge warn">Nicht eingerichtet</span> Für echte Vorschläge trägt die IT <code>ANTHROPIC_API_KEY</code> in die <code>.env</code> ein. Der manuelle Design-Editor funktioniert auch ohne KI.
                </>
              )}
            </p>
            <p className="small muted">Bildschirmfotos: {d.browser ? 'Browser-Dienst eingerichtet' : 'nicht eingerichtet (Analyse nur über HTML und CSS)'}. Der API-Schlüssel wird nie angezeigt und verlässt den Server nicht.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, margin: '12px 0' }}>
              <div className="card" style={{ padding: 12 }}>
                <div className="small muted">Kosten diesen Monat</div>
                <b>
                  {eur(d.usage.monthEur)} von {eur(d.usage.monthlyBudgetEur)}
                </b>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="small muted">Analysen heute</div>
                <b>
                  {d.usage.todayRuns} von {d.usage.dailyLimit}
                </b>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="small muted">Je Person und Stunde</div>
                <b>höchstens {d.usage.hourlyPerUser}</b>
              </div>
            </div>
            {isAdmin && (
              <button className="btn" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Spinner /> : <Plug className="lucide" aria-hidden="true" />} Verbindung prüfen
              </button>
            )}
            {test.data && <div className={`callout ${test.data.ok ? 'ok' : 'bad'}`} style={{ marginTop: 10 }}>{test.data.message}</div>}
            {test.error && <ErrorBox error={test.error} />}
            {d.recent.length > 0 && (
              <table className="t" style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>Modell</th>
                    <th>Ergebnis</th>
                    <th className="num">Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recent.map((r, i) => (
                    <tr key={i}>
                      <td className="small">{fmtDate(r.at)}</td>
                      <td className="small">{r.simulated ? 'simuliert' : r.model}</td>
                      <td className="small">{r.status === 'ok' ? 'in Ordnung' : r.status === 'invalid' ? 'unbrauchbare Antwort' : `Fehler (${r.error})`}</td>
                      <td className="num small">{eur(r.cost_eur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      <div className="card">
        <h2 className="h">Verbindungen</h2>
        <p style={{ margin: '0 0 6px' }}>
          Filum (Kurzlinks): {session.integrations.filum ? <span className="badge ok">verbunden</span> : <span className="badge">nicht verbunden</span>}
        </p>
        <p style={{ margin: 0 }}>
          Tessera (QR-Codes): {session.integrations.tessera ? <span className="badge ok">verbunden</span> : <span className="badge">nicht verbunden</span>}
        </p>
        <p className="small muted">Anbindung über FILUM_URL/FILUM_TOKEN und TESSERA_URL/TESSERA_TOKEN in der .env. Folium nutzt nur die vorhandenen Schnittstellen beider Anwendungen und verändert sie nicht.</p>
      </div>
    </div>
  );
}

function Data() {
  const qc = useQueryClient();
  const toast = useToast();
  const isAdmin = useCan('admin');
  const confirmer = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const backups = useQuery({ queryKey: ['backups'], enabled: isAdmin, queryFn: () => api.get<{ name: string; createdAt: string; bytes: number; label: string }[]>('/api/v1/backups') });
  const create = useMutation({ mutationFn: () => api.post('/api/v1/backups'), onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }) });
  const restore = useMutation({ mutationFn: (name: string) => api.post<{ message: string }>(`/api/v1/backups/${encodeURIComponent(name)}/restore`), onSuccess: (r) => toast({ text: r.message, ms: 12000 }) });
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<Error | null>(null);
  const doImport = async (f: File) => {
    setImporting(true);
    setImportErr(null);
    try {
      const res = await fetch('/api/v1/import', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/zip' }, body: f });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message ?? 'Import fehlgeschlagen.');
      void qc.invalidateQueries({ queryKey: ['pages'] });
      toast({ text: `${j.created.length} Seite(n) als Entwurf importiert.` });
    } catch (e) {
      setImportErr(e as Error);
    } finally {
      setImporting(false);
    }
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <h2 className="h">Export und Import</h2>
        <p style={{ marginTop: 0 }}>Der Export enthält alle Seiten (Entwurf und veröffentlichte Fassung), ihr Design und alle verwendeten Bilder als ZIP. Ein Import legt die Seiten als neue Entwürfe an und überschreibt nichts.</p>
        <div className="row">
          <a className="btn" href="/api/v1/export" download>
            <Download className="lucide" aria-hidden="true" /> Alles exportieren
          </a>
          {isAdmin && (
            <>
              <input ref={file} type="file" accept=".zip,application/zip" className="sr" onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
              <button className="btn" onClick={() => file.current?.click()} disabled={importing}>
                {importing ? <Spinner /> : <Upload className="lucide" aria-hidden="true" />} Export importieren
              </button>
            </>
          )}
        </div>
        {importErr && <ErrorBox error={importErr} />}
      </div>
      {isAdmin && (
        <div className="card">
          <h2 className="h">Sicherungen</h2>
          <p style={{ marginTop: 0 }}>Folium sichert Datenbank und Dateien automatisch (Intervall und Anzahl in der .env). Wiederherstellen wird beim nächsten Neustart ausgeführt; der aktuelle Stand wird vorher gesichert.</p>
          <button className="btn" onClick={() => create.mutate()} disabled={create.isPending} style={{ marginBottom: 12 }}>
            {create.isPending && <Spinner />} Jetzt sichern
          </button>
          {backups.data?.length ? (
            <table className="t">
              <tbody>
                {backups.data.map((b) => (
                  <tr key={b.name}>
                    <td>{fmtDate(b.createdAt)}</td>
                    <td className="small muted">{b.label === 'auto' ? 'automatisch' : b.label}</td>
                    <td className="small muted">{(b.bytes / 1024).toFixed(0)} KB</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => confirmer.ask({ title: 'Sicherung einspielen?', text: `Beim nächsten Neustart wird der Stand vom ${fmtDate(b.createdAt)} wiederhergestellt. Spätere Änderungen gehen dabei verloren (sie werden vorher gesichert).`, label: 'Vormerken', danger: true }, () => restore.mutate(b.name))}>
                        Wiederherstellen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Noch keine Sicherung vorhanden.</p>
          )}
          {confirmer.node}
        </div>
      )}
    </div>
  );
}
