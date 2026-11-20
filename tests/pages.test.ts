import { describe, expect, it } from 'vitest';
import { normalizeSlug } from '../src/server/lib/slug.js';
import type { Pages } from '../src/server/services/pages.js';
import { makeApp } from './helpers.js';

async function setup() {
  const t = await makeApp();
  const ed = await t.loginAs('editor');
  const pages = t.ctx.pages as Pages;
  return { t, ed, pages };
}

describe('Seiten', () => {
  it('creates page from organisation template with legal links from settings and chosen preset', async () => {
    const { t, ed } = await setup();
    const admin = await t.loginAs('admin');
    await admin.call('PATCH', '/api/v1/settings', { imprintUrl: 'https://www.example.com/impressum/', privacyUrl: 'https://www.example.com/datenschutz/' });
    const r = await ed.call('POST', '/api/v1/pages', { name: 'Muster', slug: 'muster', preset: 'boutique', template: 'organisation' });
    expect(r.status).toBe(200);
    expect(r.json.draft.theme.preset).toBe('boutique');
    expect(r.json.draft.content.legal.imprintUrl).toBe('https://www.example.com/impressum/');
    expect(r.json.draft.content.blocks.some((b: { type: string; kind?: string }) => b.type === 'action' && b.kind === 'call')).toBe(true);
    expect(r.json.published).toBeNull();
  });

  it('draft changes do not alter published version', async () => {
    const { ed, pages } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial', template: 'organisation' })).json;
    expect((await ed.call('POST', `/api/v1/pages/${p.id}/publish`, { note: 'erste' })).status).toBe(200);
    const content = { ...p.draft.content, profile: { ...p.draft.content.profile, name: 'Neuer Name' } };
    const s = await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content, rev: p.draft.rev });
    expect(s.status).toBe(200);
    expect(pages.getPublishedBySlug('kp')!.content.profile.name).toBe(p.draft.content.profile.name);
    const view = (await ed.call('GET', `/api/v1/pages/${p.id}`)).json;
    expect(view.hasUnpublishedChanges).toBe(true);
  });

  it('stale rev returns 409', async () => {
    const { ed } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    const c = p.draft.content;
    expect((await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: c, rev: p.draft.rev })).status).toBe(200);
    const stale = await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: c, rev: p.draft.rev });
    expect(stale.status).toBe(409);
    expect(stale.json.error.message).toContain('inzwischen an anderer Stelle geändert');
  });

  it('publish without legal links fails with legal_missing', async () => {
    const { ed } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    const content = { ...p.draft.content, legal: { imprintUrl: null, privacyUrl: null } };
    await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content, rev: p.draft.rev });
    const r = await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe('legal_missing');
  });

  it('restore old version publishes it as new version number', async () => {
    const { ed, pages } = await setup();
    let p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const name1 = p.draft.content.profile.name;
    const c2 = { ...p.draft.content, profile: { ...p.draft.content.profile, name: 'Zwei' } };
    await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: c2, rev: p.draft.rev });
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const versions = (await ed.call('GET', `/api/v1/pages/${p.id}/versions`)).json;
    expect(versions.map((v: { number: number }) => v.number)).toEqual([2, 1]);
    const v1 = versions.find((v: { number: number }) => v.number === 1);
    const r = await ed.call('POST', `/api/v1/pages/${p.id}/versions/${v1.id}/restore`, { mode: 'publish' });
    expect(r.status).toBe(200);
    p = (await ed.call('GET', `/api/v1/pages/${p.id}`)).json;
    expect(p.published.number).toBe(3);
    expect(pages.getPublishedBySlug('kp')!.content.profile.name).toBe(name1);
  });

  it('discard draft resets to published version', async () => {
    const { ed } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const c2 = { ...p.draft.content, profile: { ...p.draft.content.profile, name: 'Entwurf' } };
    await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: c2, rev: p.draft.rev });
    const r = await ed.call('POST', `/api/v1/pages/${p.id}/discard`, {});
    expect(r.json.draft.content.profile.name).toBe(p.draft.content.profile.name);
    expect(r.json.hasUnpublishedChanges).toBe(false);
  });

  it('duplicate copies draft with new slug suffix -kopie', async () => {
    const { ed } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'signature' })).json;
    const d = (await ed.call('POST', `/api/v1/pages/${p.id}/duplicate`, {})).json;
    expect(d.slug).toBe('muster-kopie');
    expect(d.draft.theme.preset).toBe('signature');
    expect(d.published).toBeNull();
    const d2 = (await ed.call('POST', `/api/v1/pages/${p.id}/duplicate`, {})).json;
    expect(d2.slug).toBe('muster-kopie-2');
  });

  it('soft delete hides page publicly and restore brings it back; purge after 30 days', async () => {
    const { ed, pages } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    expect((await ed.call('DELETE', `/api/v1/pages/${p.id}`)).status).toBe(200);
    expect(pages.getPublishedBySlug('kp')).toBeNull();
    expect((await ed.call('GET', '/api/v1/trash')).json).toHaveLength(1);
    expect((await ed.call('GET', '/api/v1/pages')).json).toHaveLength(0);
    await ed.call('POST', `/api/v1/pages/${p.id}/restore`, {});
    expect(pages.getPublishedBySlug('kp')).not.toBeNull();
    await ed.call('DELETE', `/api/v1/pages/${p.id}`);
    expect(pages.purgeExpired(Math.floor(Date.now() / 1000) + 29 * 86400)).toBe(0);
    expect(pages.purgeExpired(Math.floor(Date.now() / 1000) + 31 * 86400)).toBe(1);
  });

  it('slug normalization and reserved slugs', async () => {
    expect(normalizeSlug('Köln Büro')).toBe('koeln-buero');
    expect(normalizeSlug('  Straße & Recht!! ')).toBe('strasse-recht');
    const { ed } = await setup();
    const r = await ed.call('POST', '/api/v1/pages', { name: 'x', slug: 'assets', preset: 'editorial' });
    expect(r.status).toBe(422);
    expect((await ed.call('POST', '/api/v1/pages', { name: 'x', slug: 'Musterstadt', preset: 'editorial' })).json.slug).toBe('musterstadt');
    expect((await ed.call('POST', '/api/v1/pages', { name: 'x', slug: 'MUSTERSTADT', preset: 'editorial' })).status).toBe(409);
  });

  it('theme change stores previous theme in history and can be applied back', async () => {
    const { ed } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    const boutique = { ...p.draft.theme, preset: 'eigenes', colors: { ...p.draft.theme.colors, accent: '#123456' } };
    const r = await ed.call('POST', `/api/v1/pages/${p.id}/theme`, { theme: boutique, source: 'manual' });
    expect(r.status).toBe(200);
    expect(r.json.draft.theme.colors.accent).toBe('#123456');
    const hist = (await ed.call('GET', `/api/v1/pages/${p.id}/theme-history`)).json;
    expect(hist[0].theme.colors.accent).toBe('#0B7032');
    const back = await ed.call('POST', `/api/v1/pages/${p.id}/theme-history/${hist[0].id}/apply`, {});
    expect(back.json.draft.theme.colors.accent).toBe('#0B7032');
  });

  it('viewer can read but not create or publish', async () => {
    const { t, ed } = await setup();
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'kp', preset: 'editorial' })).json;
    const v = await t.loginAs('viewer');
    expect((await v.call('GET', '/api/v1/pages')).status).toBe(200);
    expect((await v.call('POST', '/api/v1/pages', { name: 'x', slug: 'x', preset: 'editorial' })).status).toBe(403);
    expect((await v.call('POST', `/api/v1/pages/${p.id}/publish`, {})).status).toBe(403);
    expect((await v.call('DELETE', `/api/v1/pages/${p.id}`)).status).toBe(403);
    expect((await t.agent().call('GET', '/api/v1/pages')).status).toBe(401);
  });
});
