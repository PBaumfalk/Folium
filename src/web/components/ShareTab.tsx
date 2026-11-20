import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, Link2, QrCode } from 'lucide-react';
import { useCan } from '../App';
import { api, type PageView } from '../lib/api';
import { ErrorBox, Spinner, useToast } from './ui';

export function ShareTab({ page, publicUrl }: { page: PageView; publicUrl: string }) {
  const toast = useToast();
  const canEdit = useCan('editor');
  const info = useQuery({ queryKey: ['share', page.id], queryFn: () => api.get<{ publicUrl: string; qrUrl: string; published: boolean; filum: boolean; tessera: boolean }>(`/api/v1/pages/${page.id}/share`) });
  const filum = useMutation({ mutationFn: () => api.post<{ shortUrl: string }>(`/api/v1/pages/${page.id}/filum`) });
  const tessera = useMutation({ mutationFn: () => api.post<{ editorUrl: string }>(`/api/v1/pages/${page.id}/tessera`), onSuccess: (r) => window.open(r.editorUrl, '_blank', 'noopener') });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ text: 'Adresse kopiert.' });
    } catch {
      toast({ text: 'Kopieren nicht möglich. Bitte die Adresse markieren und kopieren.', kind: 'bad' });
    }
  };
  if (!page.published)
    return (
      <div className="empty">
        <h2>Noch nicht veröffentlicht</h2>
        <p>Veröffentlichen Sie die Seite zuerst. Danach finden Sie hier Adresse, QR-Code und Kurzlink.</p>
      </div>
    );
  const d = info.data;
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', alignItems: 'start' }}>
      <section className="card">
        <h2 className="h">Adresse</h2>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" readOnly value={publicUrl} aria-label="Öffentliche Adresse" onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => void copy(publicUrl)}>
            <Copy className="lucide" aria-hidden="true" /> Kopieren
          </button>
          <a className="btn icon" href={publicUrl} target="_blank" rel="noreferrer" aria-label="Öffnen">
            <ExternalLink className="lucide" />
          </a>
        </div>
        <p className="small muted">
          Für eine Auswertung nach Herkunft hängen Sie <code>?src=instagram</code>, <code>?src=visitenkarte</code> oder Ähnliches an. Die Statistik zeigt diese Quellen getrennt.
        </p>
        <h2 className="h" style={{ marginTop: 18 }}>
          Kurzlink über Filum
        </h2>
        {d?.filum && !canEdit ? (
          <p className="small muted">Kurzlinks legen Redaktion oder Admin an.</p>
        ) : d?.filum ? (
          <>
            {filum.data ? (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" readOnly value={filum.data.shortUrl} aria-label="Kurzlink" />
                <button className="btn" onClick={() => void copy(filum.data!.shortUrl)}>
                  <Copy className="lucide" aria-hidden="true" /> Kopieren
                </button>
              </div>
            ) : (
              <button className="btn" onClick={() => filum.mutate()} disabled={filum.isPending}>
                {filum.isPending ? <Spinner /> : <Link2 className="lucide" aria-hidden="true" />} Kurzlink in Filum anlegen
              </button>
            )}
            {filum.error && <ErrorBox error={filum.error} />}
          </>
        ) : (
          <p className="small muted">Filum ist nicht verbunden. Die IT kann es mit FILUM_URL und FILUM_TOKEN anbinden (Handbuch, Kapitel „Teilen“).</p>
        )}
      </section>
      <section className="card">
        <h2 className="h">QR-Code</h2>
        {d && <img src={`/api/v1/pages/${page.id}/qr?format=svg`} alt={`QR-Code für ${d.qrUrl}`} style={{ width: 200, height: 200, background: '#fff', borderRadius: 8, border: '1px solid var(--line)', padding: 6 }} />}
        <p className="small muted">Führt zu {d?.qrUrl}. Aufrufe über den Code erscheinen in der Statistik als Quelle „QR-Code“.</p>
        <div className="row">
          <a className="btn sm" href={`/api/v1/pages/${page.id}/qr?format=png&size=2048`} download={`qr-${page.slug}.png`}>
            <Download className="lucide" aria-hidden="true" /> PNG (2048 px)
          </a>
          <a className="btn sm" href={`/api/v1/pages/${page.id}/qr?format=svg`} download={`qr-${page.slug}.svg`}>
            <Download className="lucide" aria-hidden="true" /> SVG für den Druck
          </a>
          {d?.tessera && canEdit && (
            <button className="btn sm" onClick={() => tessera.mutate()} disabled={tessera.isPending}>
              {tessera.isPending ? <Spinner /> : <QrCode className="lucide" aria-hidden="true" />} In Tessera gestalten
            </button>
          )}
        </div>
        {tessera.error && <ErrorBox error={tessera.error} />}
        {!d?.tessera && <p className="small muted">Für Logo, Rahmen und Druckvorschau lässt sich Tessera anbinden (TESSERA_URL und TESSERA_TOKEN).</p>}
      </section>
    </div>
  );
}
