import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ctx } from '../context.js';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE } from '../services/auth.js';
import { makeErrorHandler } from './http.js';
import { registerAuthRoutes } from './routes/auth.js';

export type RouteModule = (app: FastifyInstance, ctx: Ctx) => void | Promise<void>;

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildAdminServer(ctx: Ctx, routeModules: RouteModule[] = []): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: ctx.config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,

  });
  app.decorateRequest('principal', null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.setErrorHandler(makeErrorHandler(ctx.log));

  const allowedOrigin = new URL(ctx.config.appUrl).origin;

  app.addHook('onRequest', async (req) => {
    req.principal = null;
    const u = ctx.auth.sessionUser(req.cookies[SESSION_COOKIE]);
    if (u) req.principal = { userId: u.id, role: u.role, label: u.email };

    // Schutz gegen Cross-Site-Anfragen: schreibende Anfragen nur aus der eigenen Oberfläche.
    if (!SAFE.has(req.method) && req.url.startsWith('/api/')) {
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      const sameOrigin = origin ? origin === allowedOrigin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}` : site === 'same-origin';
      if (!sameOrigin) throw new AppError(403, 'bad_origin', 'Diese Anfrage stammt nicht aus der Folium-Oberfläche und wurde abgelehnt.');
    }
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    if (!reply.getHeader('X-Frame-Options')) reply.header('X-Frame-Options', 'SAMEORIGIN');
    return payload;
  });

  app.get('/healthz', async () => {
    ctx.db.prepare('SELECT 1').get();
    return { ok: true, version: ctx.config.version };
  });

  registerAuthRoutes(app, ctx);
  for (const m of routeModules) await m(app, ctx);

  // Oberfläche (gebaut nach dist/web); im Test/Dev ggf. nicht vorhanden.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDir = [path.resolve(here, '../web'), path.resolve(here, '../../dist/web'), path.resolve(here, '../../../dist/web')].find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (webDir) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false, index: false, maxAge: '1h', immutable: false });
    const indexHtml = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Unbekannte Schnittstelle.' } });
      if (req.url.startsWith('/assets/')) return reply.status(404).send('Nicht gefunden');
      return reply.type('text/html').header('Cache-Control', 'no-store').send(indexHtml);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Nicht gefunden.' } }));
  }
  return app;
}
