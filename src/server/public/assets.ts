import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';

/** Hochgeladene Bilder, Logos und Schriften. Namen sind Inhalts-Hashes, daher dauerhaft cachebar. */
export function registerPublicAssets(app: FastifyInstance, ctx: Ctx) {
  app.get('/assets/:file', async (req, reply) => {
    const r = ctx.assets.resolve((req.params as { file: string }).file);
    if (!r) return reply.status(404).type('text/plain; charset=utf-8').send('Nicht gefunden');
    return reply
      .type(r.type)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .header('Cross-Origin-Resource-Policy', 'same-site')
      .send(fs.createReadStream(r.path));
  });
}
