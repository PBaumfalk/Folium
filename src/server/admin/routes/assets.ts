import multipart from '@fastify/multipart';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../../context.js';
import { AppError } from '../../lib/errors.js';
import { MAX_UPLOAD } from '../../services/assets.js';
import { need } from '../http.js';

export async function registerAssetRoutes(app: FastifyInstance, ctx: Ctx) {
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD, files: 1, fields: 5, fieldSize: 1000 } });

  app.post('/api/v1/assets', { bodyLimit: MAX_UPLOAD + 64 * 1024 }, async (req) => {
    const p = need(req, 'editor');
    const file = await req.file().catch(() => undefined);
    if (!file) throw new AppError(400, 'no_file', 'Bitte eine Datei auswählen.');
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      throw new AppError(413, 'too_large', 'Die Datei ist größer als 5 MB.');
    }
    if (file.file.truncated) throw new AppError(413, 'too_large', 'Die Datei ist größer als 5 MB.');
    const row = await ctx.assets.store(buf, file.filename ?? 'Datei', p);
    ctx.audit.log(p, 'asset.upload', 'asset', row.id, { kind: row.kind });
    return ctx.assets.view(row);
  });

  app.get('/api/v1/assets', async (req) => {
    need(req, 'viewer');
    return ctx.assets.list();
  });

  app.delete('/api/v1/assets/:id', async (req) => {
    const p = need(req, 'editor');
    const id = (req.params as { id: string }).id;
    const used = (aid: string) =>
      Boolean(ctx.db.prepare('SELECT 1 FROM pages WHERE draft_content LIKE ? OR draft_theme LIKE ? LIMIT 1').get(`%${aid}%`, `%${aid}%`)) ||
      Boolean(ctx.db.prepare('SELECT 1 FROM page_versions WHERE content LIKE ? OR theme LIKE ? LIMIT 1').get(`%${aid}%`, `%${aid}%`));
    ctx.assets.remove(id, used);
    ctx.audit.log(p, 'asset.delete', 'asset', id);
    return { ok: true };
  });

  // Dateien für Vorschau und Oberfläche (nur angemeldet)
  app.get('/api/v1/files/:file', async (req, reply) => {
    need(req, 'viewer');
    const r = ctx.assets.resolve((req.params as { file: string }).file);
    if (!r) return reply.status(404).send({ error: { code: 'not_found', message: 'Datei nicht gefunden.' } });
    return reply.type(r.type).header('Cache-Control', 'private, max-age=86400').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'").send(fs.createReadStream(r.path));
  });
}
