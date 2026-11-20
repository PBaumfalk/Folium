import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import type { Pages } from '../../services/pages.js';
import { need, parse } from '../http.js';
import { TEMPLATE_IDS } from '../../services/templates.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const createSchema = z
  .object({
    name: z.string().min(1, 'Bitte einen Namen angeben.').max(120),
    slug: z.string().max(100),
    preset: z.enum(['editorial', 'boutique', 'signature']),
    template: z.enum(TEMPLATE_IDS).optional(),
  })
  .strict();
const patchSchema = z.object({ content: z.unknown().optional(), theme: z.unknown().optional(), rev: z.number().int(), name: z.string().max(120).optional(), slug: z.string().max(100).optional() }).strict();

export function registerPageRoutes(app: FastifyInstance, ctx: Ctx) {
  const pages = ctx.pages as Pages;
  const id = (req: { params: unknown }) => parse(idParam, req.params).id;

  app.get('/api/v1/pages', async (req) => {
    need(req, 'viewer');
    return pages.list();
  });
  app.get('/api/v1/trash', async (req) => {
    need(req, 'viewer');
    return pages.list({ deleted: true });
  });
  app.post('/api/v1/pages', async (req) => {
    const p = need(req, 'editor');
    const body = parse(createSchema, req.body);
    const page = pages.create(body, p);
    ctx.audit.log(p, 'page.create', 'page', page.id, { slug: page.slug, preset: body.preset, template: body.template });
    return page;
  });
  app.get('/api/v1/pages/:id', async (req) => {
    need(req, 'viewer');
    return pages.get(id(req));
  });
  app.patch('/api/v1/pages/:id', async (req) => {
    const p = need(req, 'editor');
    const body = parse(patchSchema, req.body);
    const pid = id(req);
    if (body.name !== undefined || body.slug !== undefined) {
      pages.rename(pid, { name: body.name, slug: body.slug });
      if (body.slug !== undefined) ctx.audit.log(p, 'page.rename', 'page', pid, { slug: body.slug });
    }
    if (body.content === undefined && body.theme === undefined) return pages.get(pid);
    return pages.saveDraft(pid, body, p);
  });
  app.post('/api/v1/pages/:id/theme', async (req) => {
    const p = need(req, 'editor');
    const body = parse(z.object({ theme: z.unknown(), source: z.enum(['manual', 'preset', 'ai']), rev: z.number().int().optional() }).strict(), req.body);
    const page = pages.setTheme(id(req), body.theme, body.source, p, body.rev);
    if (body.source === 'ai') ctx.audit.log(p, 'page.theme_ai', 'page', page.id);
    return page;
  });
  app.post('/api/v1/pages/:id/publish', async (req) => {
    const p = need(req, 'editor');
    const body = parse(z.object({ note: z.string().max(300).optional(), rev: z.number().int().optional() }).strict(), req.body ?? {});
    const r = pages.publish(id(req), body.note ?? '', p, body.rev);
    ctx.audit.log(p, 'page.publish', 'page', r.page.id, { version: r.version.number });
    return r.page;
  });
  app.post('/api/v1/pages/:id/discard', async (req) => {
    const p = need(req, 'editor');
    const body = parse(z.object({ rev: z.number().int().optional() }).strict(), req.body ?? {});
    return pages.discardDraft(id(req), p, body.rev);
  });
  app.post('/api/v1/pages/:id/duplicate', async (req) => {
    const p = need(req, 'editor');
    const page = pages.duplicate(id(req), p);
    ctx.audit.log(p, 'page.duplicate', 'page', page.id, { from: id(req) });
    return page;
  });
  app.delete('/api/v1/pages/:id', async (req) => {
    const p = need(req, 'editor');
    pages.softDelete(id(req));
    ctx.audit.log(p, 'page.delete', 'page', id(req));
    return { ok: true };
  });
  app.post('/api/v1/pages/:id/restore', async (req) => {
    const p = need(req, 'editor');
    const page = pages.restore(id(req));
    ctx.audit.log(p, 'page.restore', 'page', page.id);
    return page;
  });
  app.get('/api/v1/pages/:id/versions', async (req) => {
    need(req, 'viewer');
    return pages.versions(id(req));
  });
  app.get('/api/v1/pages/:id/versions/:vid', async (req) => {
    need(req, 'viewer');
    const { vid } = parse(z.object({ id: z.coerce.number(), vid: z.coerce.number().int().positive() }), req.params);
    return pages.versionContent(id(req), vid);
  });
  app.post('/api/v1/pages/:id/versions/:vid/restore', async (req) => {
    const p = need(req, 'editor');
    const { vid } = parse(z.object({ id: z.coerce.number(), vid: z.coerce.number().int().positive() }), req.params);
    const body = parse(z.object({ mode: z.enum(['publish', 'draft']), rev: z.number().int().optional() }).strict(), req.body);
    const page = pages.restoreVersion(id(req), vid, body.mode, p, body.rev);
    ctx.audit.log(p, 'page.restore_version', 'page', page.id, { version: vid, mode: body.mode });
    return page;
  });
  app.get('/api/v1/pages/:id/theme-history', async (req) => {
    need(req, 'viewer');
    return pages.themeHistory(id(req));
  });
  app.post('/api/v1/pages/:id/theme-history/:hid/apply', async (req) => {
    const p = need(req, 'editor');
    const { hid } = parse(z.object({ id: z.coerce.number(), hid: z.coerce.number().int().positive() }), req.params);
    return pages.applyHistory(id(req), hid, p);
  });
}
