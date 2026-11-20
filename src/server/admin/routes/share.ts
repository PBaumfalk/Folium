import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { AppError } from '../../lib/errors.js';
import { need, parse } from '../http.js';

/** Teilen: eingebauter QR-Code, optional Kurzlink in Filum und QR-Gestaltung in Tessera (nur über deren APIs). */
export function registerShareRoutes(app: FastifyInstance, ctx: Ctx) {
  const urls = (id: number) => {
    const p = ctx.pages.get(id);
    const publicUrl = `${ctx.config.publicBaseUrl}/${p.slug}`;
    return { page: p, publicUrl, qrUrl: `${publicUrl}?src=qr` };
  };

  app.get('/api/v1/pages/:id/share', async (req) => {
    need(req, 'viewer');
    const { page, publicUrl, qrUrl } = urls(Number((req.params as { id: string }).id));
    return { publicUrl, qrUrl, published: !!page.published, filum: Boolean(ctx.config.filum.url && ctx.config.filum.token), tessera: Boolean(ctx.config.tessera.url && ctx.config.tessera.token) };
  });

  app.get('/api/v1/pages/:id/qr', async (req, reply) => {
    need(req, 'viewer');
    const q = parse(z.object({ format: z.enum(['png', 'svg']).default('png'), size: z.coerce.number().int().min(128).max(4096).default(1024) }), req.query);
    const { qrUrl, page } = urls(Number((req.params as { id: string }).id));
    const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } };
    const name = `qr-${page.slug}.${q.format}`;
    reply.header('Content-Disposition', `inline; filename="${name}"`).header('Cache-Control', 'private, no-store');
    if (q.format === 'svg') return reply.type('image/svg+xml').send(await QRCode.toString(qrUrl, { ...opts, type: 'svg' }));
    return reply.type('image/png').send(await QRCode.toBuffer(qrUrl, { ...opts, type: 'png', width: q.size }));
  });

  const call = async (what: 'Filum' | 'Tessera', base: string, token: string, path: string, body: unknown) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    } catch (e) {
      throw new AppError(502, `${what.toLowerCase()}_unreachable`, `${what} ist nicht erreichbar (${(e as Error).message}).`);
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new AppError(502, `${what.toLowerCase()}_error`, `${what} hat die Anfrage abgelehnt (HTTP ${res.status}). ${res.status === 401 || res.status === 403 ? 'Bitte das API-Token prüfen.' : text.slice(0, 160)}`);
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new AppError(502, `${what.toLowerCase()}_error`, `${what} hat keine lesbare Antwort geliefert.`);
    }
  };

  app.post('/api/v1/pages/:id/filum', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const p = need(req, 'editor');
    const { url, token } = ctx.config.filum;
    if (!url || !token) throw new AppError(409, 'filum_off', 'Filum ist nicht verbunden (FILUM_URL und FILUM_TOKEN).');
    const { page, publicUrl } = urls(Number((req.params as { id: string }).id));
    if (!page.published) throw new AppError(409, 'unpublished', 'Bitte die Seite zuerst veröffentlichen.');
    const data = await call('Filum', url, token, '/api/v1/links', { url: publicUrl, title: `Linkseite: ${page.name}`.slice(0, 300), tags: ['Folium'] });
    ctx.audit.log(p, 'share.filum', 'page', page.id, { shortUrl: data.shortUrl });
    return { shortUrl: String(data.shortUrl ?? ''), id: data.id ?? null };
  });

  app.post('/api/v1/pages/:id/tessera', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const p = need(req, 'editor');
    const { url, token } = ctx.config.tessera;
    if (!url || !token) throw new AppError(409, 'tessera_off', 'Tessera ist nicht verbunden (TESSERA_URL und TESSERA_TOKEN).');
    const { page, qrUrl } = urls(Number((req.params as { id: string }).id));
    const data = await call('Tessera', url, token, '/api/codes', { name: `Linkseite ${page.name}`.slice(0, 120), type: 'url', content: { url: qrUrl }, tags: ['Folium'], note: `Erstellt aus Folium für /${page.slug}` });
    const codeId = (data.id ?? (data.code as { id?: unknown } | undefined)?.id) as string | number | undefined;
    ctx.audit.log(p, 'share.tessera', 'page', page.id, { codeId });
    return { codeId: codeId ?? null, editorUrl: codeId ? `${url}/codes/${codeId}` : url };
  });
}
