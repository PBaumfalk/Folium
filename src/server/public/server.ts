import Fastify, { type FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';

export type PublicRouteModule = (app: FastifyInstance, ctx: Ctx) => void | Promise<void>;

/**
 * Port 8080: ausschließlich veröffentlichte Linkseiten, ihre Dateien und der Klickzähler.
 * Keine Verwaltungsrouten, keine Entwürfe, keine Cookies.
 */
export async function buildPublicServer(ctx: Ctx, publicRouteModules: PublicRouteModule[] = []): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: ctx.config.trustProxy, bodyLimit: 4096 });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.removeHeader('set-cookie');
    return payload;
  });

  app.get('/healthz', async () => ({ ok: true }));
  for (const m of publicRouteModules) await m(app, ctx);
  app.setNotFoundHandler((_req, reply) => reply.status(404).type('text/plain; charset=utf-8').send('Nicht gefunden'));
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    req.log.error({ err }, 'Fehler im öffentlichen Server');
    return reply.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).type('text/plain; charset=utf-8').send('Fehler');
  });
  return app;
}
