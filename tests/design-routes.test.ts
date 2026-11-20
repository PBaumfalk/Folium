import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

let server: http.Server;
let base = '';
beforeAll(async () => {
  const html = fs.readFileSync('tests/fixtures/homepage/index.html', 'utf8');
  const css = fs.readFileSync('tests/fixtures/homepage/stil.css', 'utf8');
  server = http.createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(html) : req.url?.startsWith('/assets/stil.css') ? res.writeHead(200, { 'content-type': 'text/css' }).end(css) : res.writeHead(404).end()));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const env = (extra: Record<string, string> = {}) => ({ ANALYSIS_ALLOW_HOSTS: '127.0.0.1', BROWSER_WS_URL: '', ...extra });

describe('Design aus Homepage – Ablauf', () => {
  it('analyze makes no ai call and shows what would be transferred', async () => {
    const t = await makeApp(env({ AI_PROVIDER: 'fake' }));
    let calls = 0;
    const ai = t.ctx.ai!;
    const orig = ai.analyze.bind(ai);
    ai.analyze = async (...a) => {
      calls++;
      return orig(...a);
    };
    const ed = await t.loginAs('editor');
    const r = await ed.call('POST', '/api/v1/design/analyze', { url: base });
    expect(r.status, r.body).toBe(200);
    expect(calls).toBe(0);
    expect(r.json.transfer.url).toBe(base);
    expect(r.json.transfer.featureCount).toBeGreaterThan(3);
    expect(r.json.features.colors.some((c: { hex: string }) => c.hex === '#0B7032')).toBe(true);
  });

  it('propose without config returns ai_not_configured', async () => {
    const t = await makeApp(env());
    const ed = await t.loginAs('editor');
    const a = (await ed.call('POST', '/api/v1/design/analyze', { url: base })).json;
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial' })).json;
    const r = await ed.call('POST', `/api/v1/design/analyses/${a.analysisId}/propose`, { pageId: p.id, locked: [], current: p.draft.theme });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ai_not_configured');
  });

  it('propose with fake returns simulated variants and writes nothing to the page', async () => {
    const t = await makeApp(env({ AI_PROVIDER: 'fake' }));
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial' })).json;
    const a = (await ed.call('POST', '/api/v1/design/analyze', { url: base })).json;
    const r = await ed.call('POST', `/api/v1/design/analyses/${a.analysisId}/propose`, { pageId: p.id, locked: [], current: p.draft.theme });
    expect(r.status, r.body).toBe(200);
    expect(r.json.simulated).toBe(true);
    expect(r.json.proposal.variants).toHaveLength(3);
    const after = (await ed.call('GET', `/api/v1/pages/${p.id}`)).json;
    expect(after.draft.theme).toEqual(p.draft.theme);
    expect(after.draft.rev).toBe(p.draft.rev);
  });

  it('injection in ai output never reaches the theme', async () => {
    process.env.AI_FAKE_MODE = 'injection-echo';
    const t = await makeApp(env({ AI_PROVIDER: 'fake' }));
    delete process.env.AI_FAKE_MODE;
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial' })).json;
    const a = (await ed.call('POST', '/api/v1/design/analyze', { url: base })).json;
    const r = await ed.call('POST', `/api/v1/design/analyses/${a.analysisId}/propose`, { pageId: p.id, locked: [], current: p.draft.theme });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json.proposal.variants)).not.toMatch(/script|<\/style/);
  });

  it('invalid ai json is reported as unusable', async () => {
    process.env.AI_FAKE_MODE = 'invalid-json';
    const t = await makeApp(env({ AI_PROVIDER: 'fake' }));
    delete process.env.AI_FAKE_MODE;
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial' })).json;
    const a = (await ed.call('POST', '/api/v1/design/analyze', { url: base })).json;
    const r = await ed.call('POST', `/api/v1/design/analyses/${a.analysisId}/propose`, { pageId: p.id, locked: [], current: p.draft.theme });
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe('ai_invalid');
    expect(r.json.error.message).toMatch(/unbrauchbar/);
  });

  it('viewer cannot analyze; blocked internal url returns 422 with reason', async () => {
    const t = await makeApp(env({ AI_PROVIDER: 'fake', ANALYSIS_ALLOW_HOSTS: '' }));
    const v = await t.loginAs('viewer');
    expect((await v.call('POST', '/api/v1/design/analyze', { url: base })).status).toBe(403);
    const ed = await t.loginAs('editor');
    for (const url of [base, 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'file:///etc/passwd']) {
      const r = await ed.call('POST', '/api/v1/design/analyze', { url });
      expect(r.status, url).toBe(422);
      expect(r.json.error.code, url).toMatch(/^blocked_/);
    }
  });

  it('ai settings show status without leaking the key', async () => {
    const t = await makeApp(env({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-geheim-123' }));
    const a = await t.loginAs('admin');
    const r = await a.call('GET', '/api/v1/settings/ai');
    expect(r.json.configured).toBe(true);
    expect(r.json.model).toBe('claude-opus-5-5');
    expect(r.body).not.toContain('geheim');
    expect((await a.call('GET', '/api/v1/session')).body).not.toContain('geheim');
  });
});
