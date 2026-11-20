import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FONTS } from '../../shared/theme.js';
import type { Ctx } from '../context.js';
import { nextChange } from '../lib/schedule.js';
import { normalizeSlug } from '../lib/slug.js';
import { PAGE_SCRIPT_HASH, renderPage } from '../render/page.js';
import type { PublishedPage } from '../services/pages.js';

export function findDir(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(process.cwd(), name), path.resolve(here, '../../..', name), path.resolve(here, '../..', name), path.resolve(here, '..', name)];
  return candidates.find((d) => fs.existsSync(d)) ?? candidates[0];
}

export const PUBLIC_CSP = `default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'unsafe-inline'; script-src '${PAGE_SCRIPT_HASH}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

const FONT_FILES = new Map<string, string>();
for (const f of Object.values(FONTS)) for (const file of f.files) FONT_FILES.set(file.file, file.format === 'woff2' ? 'font/woff2' : 'font/ttf');

interface CacheEntry {
  html: string;
  etag: string;
  until: number;
}

export function registerPublicPages(app: FastifyInstance, ctx: Ctx) {
  const fontsDir = findDir('fonts');
  const cache = new Map<string, CacheEntry>();
  ctx.pages.onPublish((id) => {
    for (const k of cache.keys()) if (k.startsWith(`${id}:`)) cache.delete(k);
  });
  const baseHost = new URL(ctx.config.publicBaseUrl).host.toLowerCase();

  const hostOf = (req: FastifyRequest) => String(req.headers.host ?? '').toLowerCase();
  const domainRow = (host: string) => ctx.db.prepare('SELECT id, host, page_id FROM domains WHERE host = ?').get(host) as { id: number; host: string; page_id: number | null } | undefined;
  const knownHost = (host: string) => host === baseHost || Boolean(domainRow(host));

  const assetUrl = (id: string, w: number) => ctx.assets.publicUrl(id, w);

  function send(req: FastifyRequest, reply: FastifyReply, page: PublishedPage, host: string, viaRoot = false) {
    const key = `${page.pageId}:${page.versionId}:${host}:${viaRoot ? 'root' : 'pfad'}`;
    const now = new Date();
    let hit = cache.get(key);
    if (!hit || hit.until <= now.getTime()) {
      const canonical = host === baseHost || !viaRoot ? `${ctx.config.publicBaseUrl}/${page.slug}` : `${ctx.config.publicBaseUrl.startsWith('https') ? 'https' : 'http'}://${host}/`;
      const html = renderPage({
        content: page.content,
        theme: page.theme,
        mode: 'public',
        now,
        pageId: page.pageId,
        versionId: page.versionId,
        timezone: ctx.config.timezone,
        assetUrl,
        fontUrl: (f) => `/fonts/${f}`,
        uploadFontUrl: (id) => assetUrl(id, 0),
        canonicalUrl: canonical,
      });
      const change = nextChange(page.content.blocks, now, ctx.config.timezone);
      hit = { html, etag: `"${crypto.createHash('sha1').update(html).digest('base64url')}"`, until: Math.min(change ?? Infinity, now.getTime() + 10 * 60_000) };
      cache.set(key, hit);
    }
    try {
      ctx.stats.view(page.pageId, String((req.query as { src?: string }).src ?? ''), req.headers['user-agent']);
    } catch (e) {
      ctx.log.warn({ err: e }, 'Aufruf konnte nicht gezählt werden');
    }
    reply
      .header('Content-Security-Policy', PUBLIC_CSP)
      .header('Cache-Control', 'public, max-age=60, must-revalidate')
      .header('ETag', hit.etag)
      .header('X-Frame-Options', 'DENY')
      .header('Permissions-Policy', 'interest-cohort=(), camera=(), microphone=(), geolocation=()');
    if (req.headers['if-none-match'] === hit.etag) return reply.status(304).send();
    return reply.type('text/html; charset=utf-8').send(hit.html);
  }

  const notFound = (reply: FastifyReply) =>
    reply
      .status(404)
      .header('Content-Security-Policy', PUBLIC_CSP)
      .type('text/html; charset=utf-8')
      .send('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Nicht gefunden</title><body style="font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;color:#1d1d1b;background:#f5f6f3"><main style="padding:24px;max-width:28rem"><h1 style="font-size:22px">Diese Seite gibt es nicht.</h1><p>Bitte prüfen Sie die Adresse.</p></main></body></html>');

  app.get('/robots.txt', async (_req, reply) => reply.type('text/plain').send('User-agent: *\nAllow: /\n'));

  app.get('/fonts/:file', async (req, reply) => {
    const file = (req.params as { file: string }).file;
    const type = FONT_FILES.get(file);
    if (!type || file.includes('/') || file.includes('..')) return reply.status(404).send('Nicht gefunden');
    const full = path.join(fontsDir, file);
    if (!fs.existsSync(full)) return reply.status(404).send('Nicht gefunden');
    return reply.type(type).header('Cache-Control', 'public, max-age=31536000, immutable').header('Access-Control-Allow-Origin', '*').send(fs.createReadStream(full));
  });

  app.get('/', async (req, reply) => {
    const host = hostOf(req);
    const d = domainRow(host);
    const page = d?.page_id ? ctx.pages.getPublishedById(d.page_id) : null;
    if (!page) return notFound(reply);
    return send(req, reply, page, host, true);
  });

  app.get('/:slug', async (req, reply) => {
    const host = hostOf(req);
    if (!knownHost(host)) return notFound(reply);
    const slug = normalizeSlug((req.params as { slug: string }).slug);
    const page = slug ? ctx.pages.getPublishedBySlug(slug) : null;
    if (!page) return notFound(reply);
    return send(req, reply, page, host);
  });
}
