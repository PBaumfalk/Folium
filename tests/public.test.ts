import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

async function published(slug = 'muster') {
  const t = await makeApp();
  const ed = await t.loginAs('editor');
  const p = (await ed.call('POST', '/api/v1/pages', { name: 'Muster', slug, preset: 'editorial', template: 'organisation' })).json;
  return { t, ed, p };
}

describe('Öffentlicher Server', () => {
  it('unknown slug and unpublished page return 404', async () => {
    const { t } = await published();
    expect((await t.pub('/muster')).status).toBe(404);
    expect((await t.pub('/gibtsnicht')).status).toBe(404);
  });

  it('serves published page with strict headers and no cookie', async () => {
    const { t, ed, p } = await published();
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const r = await t.pub('/muster');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['set-cookie']).toBeUndefined();
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(r.body).toContain('Muster &amp; Partner');
    expect(r.body).not.toMatch(/https?:\/\/(fonts\.googleapis|cdn)/);
  });

  it('slug lookup is case-insensitive', async () => {
    const { t, ed, p } = await published();
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    expect((await t.pub('/Muster')).status).toBe(200);
  });

  it('draft edits are not visible publicly until published', async () => {
    const { t, ed, p } = await published();
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const c = { ...p.draft.content, profile: { ...p.draft.content.profile, name: 'GEHEIMER ENTWURF' } };
    await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: c, rev: p.draft.rev });
    expect((await t.pub('/muster')).body).not.toContain('GEHEIMER ENTWURF');
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    expect((await t.pub('/muster')).body).toContain('GEHEIMER ENTWURF');
  });

  it('unknown host returns neutral 404', async () => {
    const { t, ed, p } = await published();
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const r = await t.pub('/muster', { host: 'evil.example' });
    expect(r.status).toBe(404);
  });

  it('serves bundled fonts with long cache and rejects path traversal', async () => {
    const { t } = await published();
    const f = await t.pub('/fonts/newsreader-latin-opsz-normal.woff2');
    expect(f.status).toBe(200);
    expect(f.headers['content-type']).toBe('font/woff2');
    expect(String(f.headers['cache-control'])).toContain('immutable');
    expect((await t.pub('/fonts/..%2Fpackage.json')).status).toBe(404);
    expect((await t.pub('/fonts/unbekannt.woff2')).status).toBe(404);
  });

  it('robots.txt answers', async () => {
    const { t } = await published();
    expect((await t.pub('/robots.txt')).status).toBe(200);
  });
});
