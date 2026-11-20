import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { FONTS } from '../../../shared/theme.js';
import type { Ctx } from '../../context.js';
import { findDir } from '../../public/pages.js';
import { PAGE_SCRIPT_HASH, renderPage } from '../../render/page.js';
import type { PageContent } from '../../../shared/content.js';
import type { Theme } from '../../../shared/theme.js';
import { parseContent, parseTheme } from '../../services/pages.js';
import { need, parse } from '../http.js';

export const PREVIEW_CSP = `default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'unsafe-inline'; script-src '${PAGE_SCRIPT_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;

const FONT_TYPES = new Map<string, string>();
for (const f of Object.values(FONTS)) for (const file of f.files) FONT_TYPES.set(file.file, file.format === 'woff2' ? 'font/woff2' : 'font/ttf');

export function registerPreviewRoutes(app: FastifyInstance, ctx: Ctx) {
  const fontsDir = findDir('fonts');

  const html = (content: PageContent, theme: Theme, banner?: string) =>
    renderPage({
      content,
      theme,
      mode: 'preview',
      now: new Date(),
      pageId: 0,
      versionId: 0,
      timezone: ctx.config.timezone,
      assetUrl: (id, w) => ctx.assets.adminUrl(id, w),
      fontUrl: (f) => `/fonts/${f}`,
      uploadFontUrl: (id) => ctx.assets.adminUrl(id, 0),
      banner,
    });
  const send = (reply: FastifyReply, body: string) => reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store').header('Content-Security-Policy', PREVIEW_CSP).send(body);

  // Mitgelieferte Schriften auch für Vorschau und Oberfläche
  app.get('/fonts/:file', async (req, reply) => {
    const file = (req.params as { file: string }).file;
    const type = FONT_TYPES.get(file);
    const full = path.join(fontsDir, file);
    if (!type || !fs.existsSync(full)) return reply.status(404).send('Nicht gefunden');
    return reply.type(type).header('Cache-Control', 'public, max-age=31536000, immutable').send(fs.createReadStream(full));
  });

  app.get('/api/v1/pages/:id/preview', async (req, reply) => {
    need(req, 'viewer');
    const id = Number((req.params as { id: string }).id);
    const d = ctx.pages.draftOf(id);
    const embed = (req.query as { embed?: string }).embed === '1';
    return send(reply, html(d.content, d.theme, embed ? '' : undefined));
  });

  app.get('/api/v1/pages/:id/versions/:vid/preview', async (req, reply) => {
    need(req, 'viewer');
    const { id, vid } = parse(z.object({ id: z.coerce.number(), vid: z.coerce.number() }), req.params);
    const v = ctx.pages.versionContent(id, vid);
    return send(reply, html(v.content, v.theme, `Vorschau – Version ${v.number}`));
  });

  // Live-Vorschau des ungespeicherten Zustands; speichert nichts
  app.post('/api/v1/preview', { bodyLimit: 512 * 1024 }, async (req, reply) => {
    need(req, 'viewer');
    const body = parse(z.object({ content: z.unknown(), theme: z.unknown(), banner: z.string().max(80).optional() }).strict(), req.body);
    return send(reply, html(parseContent(body.content), parseTheme(body.theme), body.banner));
  });
}
