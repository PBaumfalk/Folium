import { describe, expect, it } from 'vitest';
import { makeApp, SETUP } from './helpers.js';

const admin = { email: 'admin@example.test', name: 'Admin', password: 'sehr-geheimes-passwort' };

describe('Anmeldung', () => {
  it('setup creates first admin only with valid setup code', async () => {
    const t = await makeApp();
    const a = t.agent();
    expect((await a.call('POST', '/api/v1/setup', { ...admin, code: '000-000-000' })).status).toBe(403);
    const ok = await a.call('POST', '/api/v1/setup', { ...admin, code: SETUP });
    expect(ok.status).toBe(200);
    expect(ok.json.user.role).toBe('admin');
    const again = await t.agent().call('POST', '/api/v1/setup', { ...admin, email: 'x@example.test', code: SETUP });
    expect(again.status).toBe(409);
  });

  it('login sets HttpOnly SameSite=Strict cookie', async () => {
    const t = await makeApp();
    await t.agent().call('POST', '/api/v1/setup', { ...admin, code: SETUP });
    const r = await t.agent().call('POST', '/api/v1/login', { email: admin.email, password: admin.password });
    expect(r.status).toBe(200);
    const c = String(r.headers['set-cookie']);
    expect(c).toContain('folium_session=');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
  });

  it('login throttles after 5 failures', async () => {
    const t = await makeApp();
    await t.agent().call('POST', '/api/v1/setup', { ...admin, code: SETUP });
    const a = t.agent();
    for (let i = 0; i < 5; i++) expect((await a.call('POST', '/api/v1/login', { email: admin.email, password: 'falsch-falsch' })).status).toBe(401);
    expect((await a.call('POST', '/api/v1/login', { email: admin.email, password: admin.password })).status).toBe(429);
  });

  it('write request with foreign Origin is rejected', async () => {
    const t = await makeApp();
    const a = await t.loginAs('admin');
    const r = await a.call('POST', '/api/v1/logout', {}, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });

  it('viewer cannot call admin route; anonymous gets 401', async () => {
    const t = await makeApp();
    const v = await t.loginAs('viewer');
    expect((await v.call('POST', '/api/v1/users', { email: 'n@example.test', role: 'admin', password: 'sehr-geheimes-passwort' })).status).toBe(403);
    expect((await t.agent().call('GET', '/api/v1/users')).status).toBe(401);
  });

  it('session endpoint reports user and logout ends session', async () => {
    const t = await makeApp();
    const a = await t.loginAs('editor');
    const s = await a.call('GET', '/api/v1/session');
    expect(s.json.user.role).toBe('editor');
    await a.call('POST', '/api/v1/logout', {});
    expect((await a.call('GET', '/api/v1/session')).json.user).toBeNull();
  });
});
