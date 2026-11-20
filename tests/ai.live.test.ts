/**
 * ECHTER KI-Test gegen die Anthropic-API (kostet ca. 0,10–0,30 €). Läuft nur mit Schlüssel:
 *   node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai.live.test.ts
 * Ergebnis (Modell, Tokens, Kosten, Varianten) wird nach docs/pruefbericht-ki.json geschrieben.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/server/ai/anthropic.js';
import { estimateCostEur } from '../src/server/ai/budget.js';
import { mapAiResult } from '../src/server/ai/map.js';
import { analyzeHomepage } from '../src/server/analysis/index.js';
import { loadConfig } from '../src/server/config.js';
import { createLogger } from '../src/server/lib/log.js';
import { PRESETS } from '../src/shared/theme.js';

const key = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!key)('Echte KI (Anthropic)', () => {
  it('real analysis of a real homepage yields three valid variants', async () => {
    const { chromium } = await import('playwright-core');
    const server = await chromium.launchServer({ headless: true });
    const cfg = loadConfig({ ...process.env, BROWSER_WS_URL: server.wsEndpoint() });
    const a = await analyzeHomepage(process.env.AI_LIVE_URL ?? 'https://www.example.com/', 0, cfg, createLogger('warn'));
    await server.close();
    const provider = new AnthropicProvider(key!, cfg.ai.model, 180_000);
    expect((await provider.testConnection()).ok).toBe(true);
    const started = Date.now();
    const raw = await provider.analyze({ url: a.finalUrl, features: a.features, screenshots: a.screenshots, locked: [], current: PRESETS.editorial, contentSummary: 'Muster & Partner: Hauptaktionen Anrufen, Termin, E-Mail; Links zu Leistungen; zwei Standorte. Titelbild vorhanden: ja.' }, AbortSignal.timeout(180_000));
    const mapped = mapAiResult(raw.raw, a.features, { current: PRESETS.editorial, locked: [] });
    const cost = estimateCostEur(raw.model, raw.usage);
    fs.writeFileSync('docs/pruefbericht-ki.json', JSON.stringify({ at: new Date().toISOString(), model: raw.model, usage: raw.usage, costEur: cost, ms: Date.now() - started, screenshots: !!a.screenshots, result: mapped }, null, 1));
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.result.variants).toHaveLength(3);
    // „Erkannt“ darf nur sein, was die Analyse belegt
    const found = new Set(a.features.colors.map((c) => c.hex));
    expect(mapped.result.detected.colors.every((c) => found.has(c.hex))).toBe(true);
    expect(cost).toBeLessThan(0.5);
  }, 300_000);
});
