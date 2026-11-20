import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import { themeSchema } from '../../../shared/theme.js';
import { AiBudget, estimateCostEur, estimateRequest } from '../../ai/budget.js';
import { mapAiResult, type DesignProposal } from '../../ai/map.js';
import { AiError } from '../../ai/provider.js';
import { analyzeHomepage, type Analysis } from '../../analysis/index.js';
import type { Ctx } from '../../context.js';
import { AppError, notFound } from '../../lib/errors.js';
import { need, parse } from '../http.js';

const TTL = 2 * 3600_000;
const LOCKABLE = ['colors.background', 'colors.surface', 'colors.text', 'colors.muted', 'colors.accent', 'colors.onAccent', 'colors.border', 'fonts.heading', 'fonts.body', 'buttons.shape', 'buttons.style', 'cards.style', 'density', 'header.layout', 'linkLayout', 'primaryAction'] as const;

export function registerDesignRoutes(app: FastifyInstance, ctx: Ctx) {
  const analyses = new Map<string, { a: Analysis; at: number }>();
  const proposals = new Map<string, { p: DesignProposal; at: number; simulated: boolean; model: string }>();
  const budget = new AiBudget(ctx.db, ctx.config.ai);
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of analyses) if (now - v.at > TTL) analyses.delete(k);
    for (const [k, v] of proposals) if (now - v.at > 24 * 3600_000) proposals.delete(k);
    while (analyses.size > 30) analyses.delete(analyses.keys().next().value!);
  };
  const getAnalysis = (id: string) => {
    sweep();
    const e = analyses.get(id);
    if (!e) throw new AppError(404, 'analysis_expired', 'Diese Analyse ist abgelaufen. Bitte die Homepage erneut untersuchen.');
    return e.a;
  };

  app.post('/api/v1/design/analyze', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const p = need(req, 'editor');
    const { url } = parse(z.object({ url: z.string().min(1, 'Bitte eine Adresse eingeben.').max(500) }).strict(), req.body);
    const a = await analyzeHomepage(url, p.userId, ctx.config, ctx.log);
    analyses.set(a.id, { a, at: Date.now() });
    ctx.audit.log(p, 'design.analyze', 'url', a.finalUrl, { requests: a.stats.requests, screenshots: !!a.screenshots });
    const f = a.features;
    const images = a.screenshots ? [{ width: 1440, height: 900 }, { width: 780, height: 1688 }] : [];
    const est = estimateRequest(ctx.ai?.model ?? ctx.config.ai.model, JSON.stringify(f).length, images);
    return {
      analysisId: a.id,
      url: a.finalUrl,
      features: f,
      screenshots: a.screenshots ? { desktop: `/api/v1/design/analyses/${a.id}/desktop.png`, mobile: `/api/v1/design/analyses/${a.id}/mobile.png` } : null,
      transfer: {
        url: a.finalUrl,
        provider: ctx.ai ? ctx.ai.id : null,
        model: ctx.ai?.model ?? null,
        featureCount: f.colors.length + f.fonts.length + f.buttons.length + f.logo.length,
        textChars: f.textSample.length,
        images: images.length,
        estInputTokens: est.inputTokens,
        estCostEur: Math.round(est.costEur * 100) / 100,
      },
      aiConfigured: !!ctx.ai,
      simulated: ctx.ai?.id === 'fake',
      stats: a.stats,
    };
  });

  app.get('/api/v1/design/analyses/:id/:which', async (req, reply) => {
    need(req, 'editor');
    const { id, which } = req.params as { id: string; which: string };
    const a = getAnalysis(id);
    if (!a.screenshots || !['desktop.png', 'mobile.png'].includes(which)) throw notFound('Bildschirmfoto');
    const buf = which === 'desktop.png' ? a.screenshots.desktop : a.screenshots.mobile;
    // Verkleinert ausliefern; die volle Auflösung geht nur an die KI
    const small = await sharp(buf).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return reply.type('image/webp').header('Cache-Control', 'private, max-age=3600').send(small);
  });

  app.post('/api/v1/design/analyses/:id/propose', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const p = need(req, 'editor');
    const a = getAnalysis((req.params as { id: string }).id);
    const body = parse(z.object({ pageId: z.number().int().positive(), locked: z.array(z.enum(LOCKABLE)).max(20), current: z.unknown(), force: z.boolean().optional() }).strict(), req.body);
    const current = themeSchema.parse(body.current);
    const page = ctx.pages.draftOf(body.pageId);
    if (!ctx.ai) throw new AppError(409, 'ai_not_configured', 'Die KI ist nicht eingerichtet. Sie können das Design unten manuell anpassen.');
    const lockedValues = body.locked.map((l) => [l, l.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], current)]);
    const key = `${a.contentHash}|${ctx.ai.model}|${body.pageId}|${JSON.stringify(current)}|${JSON.stringify(lockedValues)}`;
    const cached = proposals.get(key);
    if (cached && !body.force) return { proposal: cached.p, simulated: cached.simulated, model: cached.model, cached: true, costEur: 0 };

    if (ctx.ai.id !== 'fake') budget.check(p.userId);
    const started = Date.now();
    const summary = `${page.content.profile.name}: ${page.content.profile.tagline}. Einträge: ${page.content.blocks.map((b) => b.type).join(', ')}. Titelbild vorhanden: ${page.content.profile.coverAssetId ? 'ja' : 'nein'}.`;
    let raw;
    try {
      raw = await ctx.ai.analyze({ url: a.finalUrl, features: a.features, screenshots: a.screenshots, locked: body.locked, current, contentSummary: summary }, AbortSignal.timeout(ctx.config.ai.timeoutMs));
    } catch (e) {
      const err = e instanceof AppError ? e : new AiError('ai_error', (e as Error).message);
      budget.record({ userId: p.userId, url: a.finalUrl, model: ctx.ai.model, status: 'error', inputTokens: 0, outputTokens: 0, costEur: 0, ms: Date.now() - started, error: err.code, simulated: ctx.ai.id === 'fake' });
      throw err;
    }
    const costEur = estimateCostEur(raw.model, raw.usage);
    let mapped: ReturnType<typeof mapAiResult>;
    try {
      mapped = mapAiResult(raw.raw, a.features, { current, locked: body.locked });
    } catch {
      mapped = { ok: false, error: 'Die Antwort der KI war unbrauchbar. Bitte erneut versuchen oder das Design manuell anpassen.' };
    }
    budget.record({ userId: p.userId, url: a.finalUrl, model: raw.model, status: mapped.ok ? 'ok' : 'invalid', inputTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens, costEur, ms: Date.now() - started, error: mapped.ok ? null : 'invalid_output', simulated: raw.simulated });
    ctx.audit.log(p, 'design.propose', 'page', body.pageId, { model: raw.model, costEur: Math.round(costEur * 1000) / 1000, ok: mapped.ok, simulated: raw.simulated });
    if (!mapped.ok) throw new AppError(502, 'ai_invalid', mapped.error);
    proposals.set(key, { p: mapped.result, at: Date.now(), simulated: raw.simulated, model: raw.model });
    return { proposal: mapped.result, simulated: raw.simulated, model: raw.model, fallbackModel: raw.fallbackModel ?? null, cached: false, costEur: Math.round(costEur * 1000) / 1000 };
  });

  app.get('/api/v1/settings/ai', async (req) => {
    need(req, 'editor');
    return { configured: !!ctx.ai, provider: ctx.ai?.id ?? ctx.config.ai.provider, model: ctx.ai?.model ?? ctx.config.ai.model, simulated: ctx.ai?.id === 'fake', browser: !!ctx.config.browserWsUrl, usage: budget.usage(), recent: budget.recent(15) };
  });
  app.post('/api/v1/settings/ai/test', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    need(req, 'admin');
    if (!ctx.ai) return { ok: false, message: 'Kein KI-Anbieter eingerichtet (ANTHROPIC_API_KEY fehlt).', model: ctx.config.ai.model };
    return ctx.ai.testConnection();
  });
}
