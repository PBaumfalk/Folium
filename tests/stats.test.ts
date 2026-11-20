import { describe, expect, it } from 'vitest';
import type { Stats } from '../src/server/services/stats.js';
import { makeApp } from './helpers.js';

const MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

async function setup() {
  const t = await makeApp();
  const ed = await t.loginAs('editor');
  const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial', template: 'organisation' })).json;
  const page = (await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {})).json;
  const link = page.draft.content.blocks.find((b: { type: string }) => b.type === 'link');
  const stats = t.ctx.stats as Stats;
  return { t, ed, page, link, stats };
}
const click = (t: Awaited<ReturnType<typeof makeApp>>, body: unknown, ua = MOBILE) =>
  t.pub('/c', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': ua } });

describe('Statistik', () => {
  it('counts views and clicks per day, separating bots', async () => {
    const { t, ed, page, link, stats } = await setup();
    await t.pub('/muster');
    await t.pub('/muster?src=qr');
    await t.pub('/muster', { headers: { 'user-agent': 'WhatsApp/2.23' } });
    expect((await click(t, { p: page.id, v: page.published.versionId, b: link.id, s: 'qr' })).status).toBe(204);
    stats.flush();
    const r = await ed.call('GET', `/api/v1/stats?pageId=${page.id}&days=7`);
    expect(r.status).toBe(200);
    expect(r.json.totals.views).toBe(2);
    expect(r.json.totals.bots).toBe(1);
    expect(r.json.totals.clicks).toBe(1);
    expect(r.json.sources.find((s: { source: string }) => s.source === 'qr').views).toBe(1);
    const row = r.json.blocks.find((b: { blockId: string }) => b.blockId === link.id);
    expect(row.clicks).toBe(1);
    expect(row.title).toBe(link.title);
  });

  it('click endpoint returns 204 even when db write fails', async () => {
    const { t, page, link, stats } = await setup();
    stats.click = () => {
      throw new Error('Datenbank kaputt');
    };
    const r = await click(t, { p: page.id, v: 1, b: link.id, s: '' });
    expect(r.status).toBe(204);
    expect((await click(t, 'kein json')).status).toBe(204);
  });

  it('ignores clicks for unknown blocks or pages', async () => {
    const { t, ed, page, stats } = await setup();
    await click(t, { p: page.id, v: 1, b: 'zzzzzzzzzz', s: '' });
    await click(t, { p: 999, v: 1, b: 'zzzzzzzzzz', s: '' });
    stats.flush();
    expect((await ed.call('GET', `/api/v1/stats?pageId=${page.id}&days=7`)).json.totals.clicks).toBe(0);
  });

  it('does not store ip or set cookie', async () => {
    const { t, page, link, stats } = await setup();
    const r = await t.pub('/muster', { headers: { 'x-forwarded-for': '203.0.113.77' } });
    expect(r.headers['set-cookie']).toBeUndefined();
    await click(t, { p: page.id, v: 1, b: link.id, s: '' });
    stats.flush();
    const dump = JSON.stringify(t.ctx.db.prepare('SELECT * FROM stats_daily').all());
    expect(dump).not.toContain('203.0.113');
    expect(dump).not.toContain('iPhone');
  });

  it('aggregates per day in Europe/Berlin', async () => {
    const { page, stats } = await setup();
    // 23:30 UTC am 31.12. ist in Berlin schon der 1.1.
    stats.view(page.id, '', MOBILE, new Date('2026-12-31T23:30:00Z'));
    stats.flush();
    const row = stats.db.prepare('SELECT day FROM stats_daily WHERE page_id = ? AND kind = ?').get(page.id, 'view') as { day: number };
    expect(row.day).toBe(20270101);
  });

  it('csv has header Tag;Aufrufe;Klicks', async () => {
    const { t, ed, page } = await setup();
    await t.pub('/muster');
    (t.ctx.stats as Stats).flush();
    const r = await ed.call('GET', `/api/v1/stats.csv?pageId=${page.id}&days=7`);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('text/csv');
    expect(r.body.split('\n')[0].replace('﻿', '')).toBe('Tag;Aufrufe;Klicks');
  });

  it('stats can be disabled in settings', async () => {
    const { t, page, stats } = await setup();
    t.ctx.settings.update({ statsEnabled: false });
    await t.pub('/muster');
    stats.flush();
    expect((t.ctx.db.prepare('SELECT COUNT(*) AS n FROM stats_daily WHERE page_id = ?').get(page.id) as { n: number }).n).toBe(0);
  });
});
