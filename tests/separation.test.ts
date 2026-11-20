import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

describe('Trennung öffentlich / Verwaltung', () => {
  it('public port exposes no /api routes', async () => {
    const t = await makeApp();
    for (const url of ['/api/v1/session', '/api/v1/pages', '/api/v1/setup']) {
      expect((await t.pub(url)).status).toBe(404);
    }
    expect((await t.pub('/api/v1/setup', { method: 'POST', body: '{}' })).status).toBe(404);
  });

  it('public healthz answers', async () => {
    const t = await makeApp();
    expect((await t.pub('/healthz')).status).toBe(200);
  });
});
