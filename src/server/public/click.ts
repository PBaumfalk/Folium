import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';

/**
 * Klickzähler. Antwortet immer mit 204 – ein Fehler in der Statistik darf nie den
 * Besuch stören. Der Link selbst ist ein normales <a href> und funktioniert ohnehin unabhängig davon.
 * Die Absenderadresse dient nur der kurzzeitigen Begrenzung im Arbeitsspeicher und wird nicht gespeichert.
 */
export async function registerClick(app: FastifyInstance, ctx: Ctx) {
  await app.register(rateLimit, { global: false });
  app.addContentTypeParser('text/plain', { parseAs: 'string', bodyLimit: 1024 }, (_req, body, done) => done(null, body));

  app.post('/c', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, bodyLimit: 1024 }, async (req, reply) => {
    try {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      const d = JSON.parse(raw) as { p?: unknown; b?: unknown; s?: unknown };
      const pageId = Number(d.p);
      const blockId = String(d.b ?? '');
      if (Number.isInteger(pageId) && pageId > 0 && /^[a-z0-9]{6,16}$/.test(blockId)) {
        const page = ctx.pages.getPublishedById(pageId);
        if (page && page.content.blocks.some((b) => b.id === blockId)) {
          ctx.stats.click(pageId, blockId, String(d.s ?? ''), req.headers['user-agent']);
        }
      }
    } catch (e) {
      ctx.log.debug({ err: e }, 'Klick nicht gezählt');
    }
    return reply.status(204).header('Cache-Control', 'no-store').send();
  });
}
