import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { need, parse } from '../http.js';

const q = z
  .object({
    pageId: z.coerce.number().int().positive().optional(),
    days: z.coerce.number().int().min(1).max(730).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    type: z.enum(['days', 'links']).optional(),
  })
  .strict();

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // Schutz vor Formeln in Tabellenprogrammen
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function registerStatsRoutes(app: FastifyInstance, ctx: Ctx) {
  const run = (raw: unknown) => {
    const o = parse(q, raw);
    ctx.stats.flush();
    const range = ctx.stats.range(o.days, o.from, o.to);
    return { o, data: ctx.stats.query({ pageId: o.pageId, ...range }, ctx.pages) };
  };

  app.get('/api/v1/stats', async (req) => {
    need(req, 'viewer');
    return { ...run(req.query).data, enabled: ctx.settings.get('statsEnabled'), retentionDays: ctx.settings.get('statsRetentionDays') };
  });

  app.get('/api/v1/stats.csv', async (req, reply) => {
    need(req, 'viewer');
    const { o, data } = run(req.query);
    const lines =
      o.type === 'links'
        ? ['Seite;Eintrag;Klicks;Klickrate %', ...data.blocks.map((b) => [data.pages.find((p) => p.pageId === b.pageId)?.name ?? b.pageId, b.title, b.clicks, b.ctr ?? ''].map(csvCell).join(';'))]
        : ['Tag;Aufrufe;Klicks', ...data.days.map((d) => [d.day, d.views, d.clicks].join(';'))];
    const name = `folium-statistik-${o.type === 'links' ? 'links' : 'tage'}-${data.from}-bis-${data.to}.csv`;
    return reply.type('text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${name}"`).send('﻿' + lines.join('\n') + '\n');
  });
}
