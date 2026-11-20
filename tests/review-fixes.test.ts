import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { captureScreenshots } from '../src/server/analysis/browser.js';
import { createLogger } from '../src/server/lib/log.js';
import { classifyAddress, FetchBudget } from '../src/server/lib/safefetch.js';
import { themeSchema, PRESETS } from '../src/shared/theme.js';
import { makeApp } from './helpers.js';

describe('Befunde der Gesamtprüfung', () => {
  it('duplicate/import with 60-char slug terminates with distinct slugs', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const slug = 'a'.repeat(60);
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'Lang', slug, preset: 'editorial' })).json;
    const d1 = (await ed.call('POST', `/api/v1/pages/${p.id}/duplicate`, {})).json;
    const d2 = (await ed.call('POST', `/api/v1/pages/${p.id}/duplicate`, {})).json;
    expect(new Set([p.slug, d1.slug, d2.slug]).size).toBe(3);
    for (const s of [d1.slug, d2.slug]) expect(s.length).toBeLessThanOrEqual(60);
    const i1 = t.ctx.pages.createImported({ name: 'x', slug, content: p.draft.content, theme: p.draft.theme }, null);
    const i2 = t.ctx.pages.createImported({ name: 'x', slug, content: p.draft.content, theme: p.draft.theme }, null);
    expect(i1.slug).not.toBe(i2.slug);
  });

  it('corrupt zip import returns 422 and does not crash', async () => {
    const t = await makeApp();
    const a = await t.loginAs('admin');
    // gültiger Kopf, kaputter Deflate-Strom
    const name = Buffer.from('folium-export.json');
    const data = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x13, 0x37]);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(5000, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(5000, 24); central.writeUInt16LE(name.length, 28);
    const cdOffset = local.length + name.length + data.length;
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(cdOffset, 16);
    const zip = Buffer.concat([local, name, data, central, name, end]);
    const r = await a.call('POST', '/api/v1/import', zip, { 'content-type': 'application/zip' });
    expect(r.status).toBe(422);
    expect((await a.call('GET', '/api/v1/session')).status).toBe(200);
  });

  it('publish with stale rev returns 409', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial', template: 'organisation' })).json;
    await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: { ...p.draft.content, profile: { ...p.draft.content.profile, name: 'B' } }, rev: p.draft.rev });
    expect((await ed.call('POST', `/api/v1/pages/${p.id}/publish`, { rev: p.draft.rev })).status).toBe(409);
    expect((await ed.call('POST', `/api/v1/pages/${p.id}/theme`, { theme: PRESETS.boutique, source: 'manual', rev: p.draft.rev })).status).toBe(409);
    const cur = (await ed.call('GET', `/api/v1/pages/${p.id}`)).json;
    expect((await ed.call('POST', `/api/v1/pages/${p.id}/publish`, { rev: cur.draft.rev })).status).toBe(200);
  });

  it('font id rejects prototype keys', () => {
    for (const bad of ['constructor', 'toString', '__proto__']) expect(themeSchema.safeParse({ ...PRESETS.editorial, fonts: { heading: bad, body: 'aleo' } }).success).toBe(false);
  });

  it('ssrf: additional reserved IPv6 ranges are blocked', () => {
    for (const ip of ['::7f00:1', 'fec0::1', '64:ff9b:1::a9fe:a9fe']) expect(classifyAddress(ip), ip).not.toBe('public');
  });

  it('tiny upload returns 415', async () => {
    const t = await makeApp();
    await expect(t.ctx.assets.store(Buffer.from([1, 2]), 'x', null)).rejects.toMatchObject({ status: 415 });
  });

  it('screenshots work on a page with more than 40 subresources', async () => {
    const imgs = Array.from({ length: 45 }, (_, i) => `<img src="/i${i}.png" width="10" height="10" alt="">`).join('');
    const srv = http.createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><body style="background:#0B7032"><h1>Test</h1>${imgs}</body></html>`) : res.writeHead(404).end()));
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as AddressInfo).port;
    const server = await chromium.launchServer({ headless: true });
    try {
      const policy = { allowHosts: ['127.0.0.1'], allowPrivate: false, timeoutMs: 5000, userAgent: 't' };
      const c = await captureScreenshots(`http://127.0.0.1:${port}/`, server.wsEndpoint(), policy, new FetchBudget({ maxRequests: 200, deadlineMs: 40_000 }), createLogger('silent'));
      expect(c).not.toBeNull();
      expect(c!.mobile.length).toBeGreaterThan(1000);
    } finally {
      await server.close();
      srv.close();
    }
  }, 60_000);
});
