import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { safeEqual } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { serializeUser, SESSION_COOKIE, SESSION_DAYS } from '../../services/auth.js';
import { need, parse } from '../http.js';

const setupSchema = z.object({ code: z.string().max(40), email: z.string().max(200), name: z.string().max(120).default(''), password: z.string().max(200) }).strict();
const loginSchema = z.object({ email: z.string().max(200), password: z.string().max(200) }).strict();
const userSchema = z.object({ email: z.string().max(200), name: z.string().max(120).default(''), role: z.enum(['admin', 'editor', 'viewer']), password: z.string().max(200) }).strict();
const userPatch = z.object({ role: z.enum(['admin', 'editor', 'viewer']).optional(), name: z.string().max(120).optional(), disabled: z.boolean().optional(), password: z.string().max(200).optional() }).strict();

export function registerAuthRoutes(app: FastifyInstance, ctx: Ctx) {
  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', secure: ctx.config.secureCookies, maxAge: SESSION_DAYS * 86400 });

  const session = (req: FastifyRequest) => {
    const u = req.principal ? ctx.auth.getUser(req.principal.userId) : null;
    return {
      user: u ? serializeUser(u) : null,
      needsSetup: ctx.auth.userCount() === 0,
      version: ctx.config.version,
      publicBaseUrl: ctx.config.publicBaseUrl,
      timezone: ctx.config.timezone,
      trashDays: ctx.settings.all().trashDays,
      defaultPreset: ctx.settings.all().defaultPreset,
      localLogin: !ctx.config.disableLocalLogin,
      oidc: ctx.config.oidc ? { label: ctx.config.oidc.buttonLabel } : null,
      integrations: {
        ai: ctx.ai ? { provider: ctx.ai.id, model: ctx.ai.model, simulated: ctx.ai.id === 'fake' } : null,
        filum: Boolean(ctx.config.filum.url && ctx.config.filum.token),
        tessera: Boolean(ctx.config.tessera.url && ctx.config.tessera.token),
        browser: Boolean(ctx.config.browserWsUrl),
      },
    };
  };

  app.get('/api/v1/session', async (req) => session(req));

  app.post('/api/v1/setup', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(setupSchema, req.body);
    if (ctx.auth.userCount() > 0) throw new AppError(409, 'already_setup', 'Die Einrichtung ist bereits abgeschlossen.');
    const expected = (ctx.db.prepare("SELECT value FROM meta WHERE key = 'setup_code'").get() as { value: string } | undefined)?.value ?? '';
    if (!expected || !safeEqual(body.code.trim(), expected)) throw new AppError(403, 'bad_code', 'Der Einrichtungscode stimmt nicht. Er steht im Serverprotokoll.');
    const u = await ctx.auth.createUser({ email: body.email, name: body.name || 'Admin', role: 'admin', password: body.password });
    ctx.db.prepare("DELETE FROM meta WHERE key = 'setup_code'").run();
    ctx.audit.log({ userId: u.id, role: 'admin', label: u.email }, 'setup');
    setCookie(reply, ctx.auth.createSession(u.id));
    return { user: serializeUser(u) };
  });

  app.post('/api/v1/login', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (ctx.config.disableLocalLogin) throw new AppError(403, 'local_disabled', 'Die Anmeldung mit Passwort ist abgeschaltet.');
    const body = parse(loginSchema, req.body);
    const key = `u:${body.email.trim().toLowerCase()}`;
    ctx.auth.throttle.check(key);
    const u = await ctx.auth.verifyLogin(body.email, body.password);
    if (!u) {
      ctx.auth.throttle.fail(key);
      throw new AppError(401, 'bad_login', 'E-Mail-Adresse oder Passwort stimmen nicht.');
    }
    ctx.auth.throttle.ok(key);
    setCookie(reply, ctx.auth.createSession(u.id));
    ctx.audit.log({ userId: u.id, role: u.role, label: u.email }, 'login');
    return { user: serializeUser(u) };
  });

  app.post('/api/v1/logout', async (req, reply) => {
    ctx.auth.endSession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // Konten (nur Admin)
  app.get('/api/v1/users', async (req) => {
    need(req, 'admin');
    return ctx.auth.listUsers().map(serializeUser);
  });
  app.post('/api/v1/users', async (req) => {
    const p = need(req, 'admin');
    const body = parse(userSchema, req.body);
    const u = await ctx.auth.createUser(body);
    ctx.audit.log(p, 'user.create', 'user', u.id, { email: u.email, role: u.role });
    return serializeUser(u);
  });
  app.patch('/api/v1/users/:id', async (req) => {
    const p = need(req, 'admin');
    const id = Number((req.params as { id: string }).id);
    const body = parse(userPatch, req.body);
    if (body.password) await ctx.auth.setPassword(id, body.password);
    const u = ctx.auth.updateUser(id, body);
    ctx.audit.log(p, 'user.update', 'user', id, { role: body.role, disabled: body.disabled, password: body.password ? 'geändert' : undefined });
    return serializeUser(u);
  });
  app.delete('/api/v1/users/:id', async (req) => {
    const p = need(req, 'admin');
    const id = Number((req.params as { id: string }).id);
    if (id === p.userId) throw new AppError(409, 'self', 'Sie können Ihr eigenes Konto nicht löschen.');
    ctx.auth.deleteUser(id);
    ctx.audit.log(p, 'user.delete', 'user', id);
    return { ok: true };
  });
  app.get('/api/v1/audit', async (req) => {
    need(req, 'admin');
    return ctx.audit.list(200, Number((req.query as { before?: string }).before) || undefined);
  });
}
