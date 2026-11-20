import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

describe('Vorschau', () => {
  it('preview renders draft with banner and noindex and requires login', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial', template: 'organisation' })).json;
    expect((await t.agent().call('GET', `/api/v1/pages/${p.id}/preview`)).status).toBe(401);
    const r = await ed.call('GET', `/api/v1/pages/${p.id}/preview`);
    expect(r.status).toBe(200);
    expect(r.body).toContain('Vorschau – nicht veröffentlicht');
    expect(r.body).toContain('noindex');
    expect(r.body).toContain('Muster');
    expect(r.body).not.toContain('<meta name="folium"');
  });

  it('live preview renders unsaved content and theme without storing', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial' })).json;
    const content = { ...p.draft.content, profile: { ...p.draft.content.profile, name: 'UNGESPEICHERT' } };
    const theme = { ...p.draft.theme, colors: { ...p.draft.theme.colors, accent: '#AA0000' } };
    const r = await ed.call('POST', '/api/v1/preview', { content, theme });
    expect(r.status).toBe(200);
    expect(r.body).toContain('UNGESPEICHERT');
    expect(r.body).toContain('--accent:#AA0000');
    expect((await ed.call('GET', `/api/v1/pages/${p.id}`)).json.draft.content.profile.name).not.toBe('UNGESPEICHERT');
  });

  it('live preview rejects invalid theme', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial' })).json;
    const theme = { ...p.draft.theme, colors: { ...p.draft.theme.colors, accent: 'red;}' } };
    expect((await ed.call('POST', '/api/v1/preview', { content: p.draft.content, theme })).status).toBe(422);
  });

  it('version preview shows old version', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'K', slug: 'muster', preset: 'editorial', template: 'organisation' })).json;
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const v = (await ed.call('GET', `/api/v1/pages/${p.id}/versions`)).json[0];
    const r = await ed.call('GET', `/api/v1/pages/${p.id}/versions/${v.id}/preview`);
    expect(r.status).toBe(200);
    expect(r.body).toContain('Version 1');
  });
});
