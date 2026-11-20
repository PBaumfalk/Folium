import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { AppError } from '../../lib/errors.js';
import { exportZip, importZip } from '../../services/io.js';
import { settingsSchema } from '../../services/settings.js';
import { need, parse } from '../http.js';

const hostRe = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:\d{1,5})?$/;

export function registerSettingsRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/settings', async (req) => {
    need(req, 'viewer');
    return ctx.settings.all();
  });
  app.patch('/api/v1/settings', async (req) => {
    const p = need(req, 'admin');
    const body = parse(settingsSchema.partial(), req.body);
    const s = ctx.settings.update(body);
    ctx.audit.log(p, 'settings.update', 'settings', '', { keys: Object.keys(body) });
    return s;
  });

  // Eigene Domains
  app.get('/api/v1/domains', async (req) => {
    need(req, 'viewer');
    return ctx.db.prepare('SELECT d.id, d.host, d.page_id AS pageId, p.name AS pageName FROM domains d LEFT JOIN pages p ON p.id = d.page_id ORDER BY d.host').all();
  });
  app.post('/api/v1/domains', async (req) => {
    const p = need(req, 'admin');
    const body = parse(z.object({ host: z.string().max(260), pageId: z.number().int().positive().nullable() }).strict(), req.body);
    const host = body.host.trim().toLowerCase();
    if (!hostRe.test(host)) throw new AppError(422, 'invalid', 'Bitte nur den Hostnamen angeben, z. B. links.example.com (ohne https:// und ohne Pfad).', 'host');
    if (host === new URL(ctx.config.publicBaseUrl).host) throw new AppError(422, 'invalid', 'Das ist bereits die öffentliche Hauptadresse.', 'host');
    if (body.pageId) ctx.pages.get(body.pageId);
    try {
      const r = ctx.db.prepare('INSERT INTO domains(host, page_id, created_at) VALUES (?,?,?)').run(host, body.pageId, Math.floor(Date.now() / 1000));
      ctx.audit.log(p, 'domain.create', 'domain', Number(r.lastInsertRowid), { host });
      return { id: Number(r.lastInsertRowid), host, pageId: body.pageId };
    } catch {
      throw new AppError(409, 'conflict', 'Diese Domain ist schon eingetragen.', 'host');
    }
  });
  app.delete('/api/v1/domains/:id', async (req) => {
    const p = need(req, 'admin');
    ctx.db.prepare('DELETE FROM domains WHERE id = ?').run(Number((req.params as { id: string }).id));
    ctx.audit.log(p, 'domain.delete', 'domain', (req.params as { id: string }).id);
    return { ok: true };
  });

  // Export und Import
  app.get('/api/v1/export', async (req, reply) => {
    const p = need(req, 'editor');
    const q = parse(z.object({ pageId: z.coerce.number().int().positive().optional() }), req.query);
    const buf = await exportZip(ctx, q.pageId ? [q.pageId] : 'all');
    ctx.audit.log(p, 'export', 'page', q.pageId ?? 'alle');
    const date = new Date().toISOString().slice(0, 10);
    return reply.type('application/zip').header('Content-Disposition', `attachment; filename="folium-export-${date}.zip"`).send(buf);
  });
  app.addContentTypeParser('application/zip', { parseAs: 'buffer', bodyLimit: 100 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.post('/api/v1/import', { bodyLimit: 100 * 1024 * 1024 }, async (req) => {
    const p = need(req, 'admin');
    if (!Buffer.isBuffer(req.body)) throw new AppError(415, 'unsupported', 'Bitte eine ZIP-Datei senden.');
    const r = await importZip(ctx, req.body, p);
    ctx.audit.log(p, 'import', 'page', '', { created: r.created.map((c) => c.slug) });
    return r;
  });

  // Sicherungen
  app.get('/api/v1/backups', async (req) => {
    need(req, 'admin');
    return ctx.backups.list();
  });
  app.post('/api/v1/backups', async (req) => {
    const p = need(req, 'admin');
    const b = ctx.backups.create('manuell');
    ctx.audit.log(p, 'backup.create', 'backup', b.name);
    return { name: b.name };
  });
  app.post('/api/v1/backups/:name/restore', async (req) => {
    const p = need(req, 'admin');
    const name = (req.params as { name: string }).name;
    ctx.backups.stageRestore(name);
    ctx.audit.log(p, 'backup.restore_staged', 'backup', name);
    return { ok: true, message: `Die Sicherung ${name} wird beim nächsten Neustart eingespielt (docker compose restart folium). Der aktuelle Stand wird vorher gesichert.` };
  });
}
