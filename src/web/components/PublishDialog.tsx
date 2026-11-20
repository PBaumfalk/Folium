import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { checkTheme, type Theme } from '../../shared/theme';
import type { Block, PageContent } from '../../shared/content';
import { api, type PageView } from '../lib/api';
import { blockTitle } from './BlockList';
import { Dialog, ErrorBox, Field, Spinner } from './ui';

interface Change {
  tag: 'neu' | 'geaendert' | 'entfernt';
  text: string;
}

export function diff(prev: { content: PageContent; theme: Theme } | null, next: { content: PageContent; theme: Theme }): Change[] {
  if (!prev) return [{ tag: 'neu', text: 'Erste Veröffentlichung dieser Seite' }];
  const out: Change[] = [];
  const pm = new Map(prev.content.blocks.map((b) => [b.id, b]));
  const nm = new Map(next.content.blocks.map((b) => [b.id, b]));
  for (const b of next.content.blocks) {
    const o = pm.get(b.id);
    if (!o) out.push({ tag: 'neu', text: blockTitle(b) });
    else if (JSON.stringify(o) !== JSON.stringify(b)) out.push({ tag: 'geaendert', text: changeText(o, b) });
  }
  for (const b of prev.content.blocks) if (!nm.has(b.id)) out.push({ tag: 'entfernt', text: blockTitle(b) });
  const order = (c: PageContent) => c.blocks.map((b) => b.id).filter((id) => pm.has(id) && nm.has(id)).join();
  if (order(prev.content) !== order(next.content)) out.push({ tag: 'geaendert', text: 'Reihenfolge der Einträge' });
  if (JSON.stringify(prev.content.profile) !== JSON.stringify(next.content.profile)) out.push({ tag: 'geaendert', text: 'Kopf der Seite (Name, Beschreibung oder Bilder)' });
  if (JSON.stringify(prev.content.legal) !== JSON.stringify(next.content.legal) || JSON.stringify(prev.content.meta) !== JSON.stringify(next.content.meta)) out.push({ tag: 'geaendert', text: 'Pflichtangaben oder Suchmaschinen-Einstellungen' });
  if (JSON.stringify(prev.theme) !== JSON.stringify(next.theme)) out.push({ tag: 'geaendert', text: 'Design' });
  return out;
}
function changeText(o: Block, b: Block) {
  if (o.enabled !== b.enabled) return `${blockTitle(b)} (${b.enabled ? 'eingeblendet' : 'ausgeblendet'})`;
  if (o.visibleFrom !== b.visibleFrom || o.visibleUntil !== b.visibleUntil) return `${blockTitle(b)} (Zeitplan)`;
  return blockTitle(b);
}

export function PublishDialog({ page, content, theme, onClose, onDone }: { page: PageView; content: PageContent; theme: Theme; onClose: () => void; onDone: (p: PageView) => void }) {
  const [note, setNote] = useState('');
  const prev = useQuery({
    queryKey: ['version-content', page.id, page.published?.versionId],
    enabled: !!page.published,
    queryFn: () => api.get<{ content: PageContent; theme: Theme }>(`/api/v1/pages/${page.id}/versions/${page.published!.versionId}`),
  });
  const m = useMutation({ mutationFn: () => api.post<PageView>(`/api/v1/pages/${page.id}/publish`, { note, rev: page.draft.rev }), onSuccess: onDone });
  const changes = diff(page.published ? (prev.data ?? null) : null, { content, theme });
  const contrast = checkTheme(theme).filter((c) => !c.ok);
  const legalMissing = !content.legal.imprintUrl || !content.legal.privacyUrl;
  const visible = content.blocks.filter((b) => b.enabled).length;
  return (
    <Dialog
      title="Veröffentlichen"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => m.mutate()} disabled={m.isPending || legalMissing}>
            {m.isPending && <Spinner />} Jetzt veröffentlichen
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>Der aktuelle Entwurf wird als neue Version öffentlich. Frühere Versionen bleiben erhalten und lassen sich wiederherstellen.</p>
      {m.error && <ErrorBox error={m.error} />}
      {legalMissing && <div className="callout bad">Impressum und Datenschutzerklärung fehlen. Bitte im Bereich „Seite“ eintragen.</div>}
      {contrast.length > 0 && (
        <div className="callout warn" style={{ marginTop: 8 }}>
          <span>
            Geringer Kontrast: {contrast.map((c) => `${c.label} (${c.ratio}:1)`).join(', ')}. Das erschwert das Lesen, besonders auf Smartphones im Freien.
          </span>
        </div>
      )}
      {visible === 0 && <div className="callout warn" style={{ marginTop: 8 }}>Die Seite enthält keine sichtbaren Einträge.</div>}
      <h3 className="h" style={{ marginTop: 16 }}>
        Änderungen gegenüber {page.published ? `Version ${page.published.number}` : 'bisher'}
      </h3>
      {prev.isLoading ? (
        <Spinner />
      ) : changes.length === 0 ? (
        <p className="muted">Keine inhaltlichen Änderungen.</p>
      ) : (
        <ul className="changes">
          {changes.map((c, i) => (
            <li key={i}>
              <span className={`tag ${c.tag}`}>{{ neu: 'Neu', geaendert: 'Geändert', entfernt: 'Entfernt' }[c.tag]}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 16 }}>
        <Field label="Notiz zur Version (optional)">{(id) => <input id={id} className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Öffnungszeiten Dezember" />}</Field>
      </div>
    </Dialog>
  );
}
