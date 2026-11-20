import archiver from 'archiver';
import fs from 'node:fs';
import yauzl from 'yauzl';
import type { Ctx } from '../context.js';
import { AppError } from '../lib/errors.js';
import type { Principal } from './auth.js';
import { parseContent, parseTheme } from './pages.js';

/** Export aller oder einzelner Seiten als ZIP (JSON + Dateien) und Import als neue Entwürfe. */
const MAX_IMPORT = 100 * 1024 * 1024;
const ID = /[a-f0-9]{32}/g;

export async function exportZip(ctx: Ctx, ids: number[] | 'all'): Promise<Buffer> {
  const pages = ctx.pages.list().filter((p) => ids === 'all' || ids.includes(p.id));
  const out = pages.map((p) => ({
    name: p.name,
    slug: p.slug,
    draft: { content: p.draft.content, theme: p.draft.theme },
    published: p.published ? ctx.pages.versionContent(p.id, p.published.versionId) : null,
  }));
  const json = JSON.stringify(out);
  const used = [...new Set(json.match(ID) ?? [])].filter((id) => ctx.assets.get(id));
  const assets = used.map((id) => {
    const a = ctx.assets.get(id)!;
    return { id, kind: a.kind, label: a.label, file: ctx.assets.fileFor(id, 99999)! };
  });
  const manifest = { formatVersion: 1, app: 'folium', exportedAt: new Date().toISOString(), pages: out, assets };
  return new Promise<Buffer>((resolve, reject) => {
    const arc = archiver('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    arc.on('data', (d: Buffer) => chunks.push(d));
    arc.on('end', () => resolve(Buffer.concat(chunks)));
    arc.on('error', reject);
    arc.append(JSON.stringify(manifest, null, 1), { name: 'folium-export.json' });
    for (const a of assets) {
      const r = ctx.assets.resolve(a.file);
      if (r) arc.append(fs.createReadStream(r.path), { name: `assets/${a.file}` });
    }
    void arc.finalize();
  });
}

function readZip(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new AppError(422, 'bad_zip', 'Die Datei ist kein gültiges ZIP-Archiv.'));
      const files = new Map<string, Buffer>();
      let total = 0;
      zip.on('entry', (e: yauzl.Entry) => {
        const n = e.fileName;
        if (n.includes('..') || n.startsWith('/') || n.includes('\\') || /^[a-zA-Z]:/.test(n)) {
          zip.close();
          return reject(new AppError(422, 'bad_zip', `Unzulässiger Pfad im Archiv: ${n.slice(0, 80)}`));
        }
        total += e.uncompressedSize;
        if (total > MAX_IMPORT) {
          zip.close();
          return reject(new AppError(413, 'too_large', 'Das Archiv ist entpackt größer als 100 MB.'));
        }
        if (/\/$/.test(n)) return zip.readEntry();
        zip.openReadStream(e, (er, s) => {
          if (er || !s) return reject(new AppError(422, 'bad_zip', 'Archiv beschädigt.'));
          const parts: Buffer[] = [];
          let read = 0;
          s.on('error', () => {
            zip.close();
            reject(new AppError(422, 'bad_zip', 'Das Archiv ist beschädigt und kann nicht gelesen werden.'));
          });
          s.on('data', (d: Buffer) => {
            read += d.length;
            if (read > MAX_IMPORT) {
              s.destroy();
              zip.close();
              return reject(new AppError(413, 'too_large', 'Das Archiv ist entpackt größer als 100 MB.'));
            }
            parts.push(d);
          });
          s.on('end', () => {
            files.set(n, Buffer.concat(parts));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(files));
      zip.on('error', () => reject(new AppError(422, 'bad_zip', 'Archiv beschädigt.')));
      zip.readEntry();
    });
  });
}

export async function importZip(ctx: Ctx, buf: Buffer, p: Principal): Promise<{ created: { id: number; slug: string; name: string }[] }> {
  if (buf.length > MAX_IMPORT) throw new AppError(413, 'too_large', 'Das Archiv ist größer als 100 MB.');
  const files = await readZip(buf);
  const raw = files.get('folium-export.json');
  if (!raw) throw new AppError(422, 'bad_export', 'Im Archiv fehlt folium-export.json. Ist es ein Folium-Export?');
  let m: { formatVersion: number; pages: { name: string; slug: string; draft: { content: unknown; theme: unknown } }[]; assets: { id: string; label: string; file: string }[] };
  try {
    m = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError(422, 'bad_export', 'folium-export.json ist kein gültiges JSON.');
  }
  if (m.formatVersion !== 1 || !Array.isArray(m.pages)) throw new AppError(422, 'bad_export', 'Unbekanntes Exportformat.');
  // Dateien neu einlesen (prüft und kodiert erneut) und IDs umschreiben
  const remap = new Map<string, string>();
  for (const a of m.assets ?? []) {
    const data = files.get(`assets/${a.file}`);
    if (!data || !/^[a-f0-9]{32}$/.test(a.id)) continue;
    const stored = await ctx.assets.store(data, a.label ?? 'Import', p);
    remap.set(a.id, stored.id);
  }
  const fix = (v: unknown) => JSON.parse(JSON.stringify(v).replace(ID, (id) => remap.get(id) ?? id));
  // erst alles prüfen, dann anlegen
  const prepared = m.pages.map((pg) => ({ name: String(pg.name ?? 'Import').slice(0, 120), slug: String(pg.slug ?? 'import'), content: parseContent(fix(pg.draft?.content)), theme: parseTheme(fix(pg.draft?.theme)) }));
  const created = prepared.map((pg) => {
    const v = ctx.pages.createImported(pg, p);
    return { id: v.id, slug: v.slug, name: v.name };
  });
  return { created };
}
