import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type BrowserServer } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeHomepage } from '../src/server/analysis/index.js';
import { loadConfig } from '../src/server/config.js';
import { createLogger } from '../src/server/lib/log.js';
import type { FetchPolicy } from '../src/server/lib/safefetch.js';

const html = fs.readFileSync('tests/fixtures/homepage/index.html', 'utf8').replace('</head>', '<img src="http://intern.test/geheim.png" alt=""></head>');
const css = fs.readFileSync('tests/fixtures/homepage/stil.css', 'utf8');
let server: http.Server;
let port = 0;
let browser: BrowserServer | null = null;
const hits: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    if (req.url?.startsWith('/assets/stil.css')) return res.writeHead(200, { 'content-type': 'text/css' }).end(css);
    if (req.url === '/pdf') return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF');
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  browser = await chromium.launchServer({ headless: true }).catch(() => null);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server.close(() => r()));
});

const policy: FetchPolicy = {
  allowHosts: ['127.0.0.1'],
  allowPrivate: false,
  timeoutMs: 5000,
  userAgent: 'folium-test',
  lookup: async (h) => (h === 'example.test' ? [{ address: '127.0.0.1', family: 4 }] : h === 'intern.test' ? [{ address: '10.1.1.1', family: 4 }] : []),
};
const log = createLogger('silent');

describe('Homepage-Analyse', () => {
  it('analyzes html and css without browser', async () => {
    const a = await analyzeHomepage(`http://example.test:${port}/`, 1, loadConfig({ DATA_DIR: '/tmp/x' }), log, policy);
    expect(a.features.colors.some((c) => c.hex === '#0B7032')).toBe(true);
    expect(a.screenshots).toBeNull();
    expect(a.features.notes.join(' ')).toContain('Kein Browser');
  });

  it('rejects non-html targets and internal addresses with a reason', async () => {
    await expect(analyzeHomepage(`http://example.test:${port}/pdf`, 1, loadConfig({}), log, policy)).rejects.toMatchObject({ code: 'not_html' });
    await expect(analyzeHomepage('http://intern.test/', 1, loadConfig({}), log, policy)).rejects.toMatchObject({ code: 'blocked_address', status: 422 });
    await expect(analyzeHomepage('http://169.254.169.254/', 1, loadConfig({}), log)).rejects.toMatchObject({ code: 'blocked_address' });
  });

  it('captures screenshots through the guarded fetch and blocks internal subresources', async (t) => {
    // Ohne lokal installierten Chromium sichtbar übersprungen (in der CI ist Chromium installiert)
    if (!browser) return t.skip();
    const cfg = loadConfig({ BROWSER_WS_URL: browser.wsEndpoint() });
    const a = await analyzeHomepage(`http://example.test:${port}/`, 1, cfg, log, policy);
    expect(a.screenshots).not.toBeNull();
    const meta = await sharp(a.screenshots!.mobile).metadata();
    expect(meta.width).toBe(780);
    expect((await sharp(a.screenshots!.desktop).metadata()).width).toBe(1440);
    const bodyBg = a.features.colors.find((c) => c.role === 'background');
    expect(bodyBg).toBeDefined();
    expect(a.features.fonts.find((f) => f.family === 'Aleo')?.usedFor).toContain('heading');
    expect(a.features.notes.join(' ')).toMatch(/internes Ziel|nicht geladen/);
  }, 60_000);
});
