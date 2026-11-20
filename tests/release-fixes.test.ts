import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { makeErrorHandler } from '../src/server/admin/http.js';
import { createApp } from '../src/server/app.js';
import { pendingRestoreFile } from '../src/server/services/backup.js';
import { loadConfig } from '../src/server/config.js';
import { createLogger } from '../src/server/lib/log.js';
import { PAGE_SCRIPT } from '../src/server/render/page.js';
import { makeApp } from './helpers.js';

/** Fehler, die beim Schreiben des Handbuchs aufgefallen sind (vor Version 0.1.0 behoben). */
describe('Korrekturen vor 0.1.0', () => {
  it('unexpected server errors are written to the log', () => {
    const logged: unknown[] = [];
    const log = { error: (...a: unknown[]) => logged.push(a) } as unknown as Parameters<typeof makeErrorHandler>[0];
    let status = 0;
    const reply = { status: (s: number) => ((status = s), reply), send: () => reply };
    makeErrorHandler(log)(new Error('kaputt'), { method: 'GET', url: '/api/v1/x' } as never, reply as never);
    expect(status).toBe(500);
    expect(logged).toHaveLength(1);
  });

  it('AI_MONTHLY_BUDGET_EUR=0 means zero budget, not the default', () => {
    expect(loadConfig({ AI_MONTHLY_BUDGET_EUR: '0' }).ai.monthlyBudgetEur).toBe(0);
    expect(loadConfig({}).ai.monthlyBudgetEur).toBe(20);
  });

  it('BACKUP_KEEP=0 keeps all automatic backups; two backups in one second do not collide', async () => {
    const t = await makeApp();
    const a = t.ctx.backups.create();
    const b = t.ctx.backups.create();
    expect(a.name).not.toBe(b.name);
    t.ctx.backups.prune(0);
    expect(t.ctx.backups.list().filter((x) => x.label === 'auto')).toHaveLength(2);
    t.ctx.backups.prune(1);
    expect(t.ctx.backups.list().filter((x) => x.label === 'auto')).toHaveLength(1);
  });

  it('command-line use does not apply a staged restore', async () => {
    const t = await makeApp();
    const b = t.ctx.backups.create('manuell');
    t.ctx.backups.stageRestore(b.name);
    await t.app.close();
    const cli = await createApp(t.ctx.config, createLogger('silent'), { applyRestore: false });
    await cli.close();
    expect(fs.existsSync(pendingRestoreFile(t.ctx.config))).toBe(true);
  });

  it('new page without preset uses the default design from settings', async () => {
    const t = await makeApp();
    t.ctx.settings.update({ defaultPreset: 'signature' });
    const ed = await t.loginAs('editor');
    const r = await ed.call('POST', '/api/v1/pages', { name: 'Ohne', slug: 'ohne' });
    expect(r.status).toBe(200);
    expect(r.json.draft.theme.preset).toBe('signature');
  });

  it('OIDC login keeps a manually set role when no group matches', async () => {
    const t = await makeApp();
    const u = await t.ctx.auth.upsertOidcUser('https://idp', 'sub-1', 'o@example.test', 'O', 'viewer', true, false);
    t.ctx.auth.updateUser(u.id, { role: 'editor' });
    const again = await t.ctx.auth.upsertOidcUser('https://idp', 'sub-1', 'o@example.test', 'O', 'viewer', true, false);
    expect(again.role).toBe('editor');
    const viaGroup = await t.ctx.auth.upsertOidcUser('https://idp', 'sub-1', 'o@example.test', 'O', 'admin', true, true);
    expect(viaGroup.role).toBe('admin');
  });

  it('page reached by path on an extra domain names the main address as canonical', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'M', slug: 'muster', preset: 'editorial', template: 'organisation' })).json;
    await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    const other = (await ed.call('POST', '/api/v1/pages', { name: 'P', slug: 'person', preset: 'editorial', template: 'person' })).json;
    await ed.call('POST', `/api/v1/pages/${other.id}/publish`, {});
    const a = await t.loginAs('admin');
    await a.call('POST', '/api/v1/domains', { host: 'links.maria-muster.test', pageId: other.id });
    const root = await t.pub('/', { host: 'links.maria-muster.test' });
    expect(root.body).toContain('<link rel="canonical" href="http://links.maria-muster.test/">');
    const viaPath = await t.pub('/muster', { host: 'links.maria-muster.test' });
    expect(viaPath.body).toContain('<link rel="canonical" href="http://links.test/muster">');
  });

  it('click counting accepts ?src= in any letter case', () => {
    const sent: string[] = [];
    let handler: ((e: unknown) => void) | null = null;
    const link = { getAttribute: () => 'abcdef12' };
    const document = {
      querySelector: () => ({ content: '7:3' }),
      getElementById: () => null,
      addEventListener: (_: string, h: (e: unknown) => void) => (handler = h),
    };
    class Blob {
      constructor(public parts: string[]) {}
    }
    const navigator = { sendBeacon: (_u: string, b: Blob) => sent.push(b.parts[0]) };
    vm.runInNewContext(PAGE_SCRIPT, { document, location: { search: '?src=Instagram' }, navigator, Blob, window: {} });
    handler!({ target: { closest: () => link } });
    expect(JSON.parse(sent[0]).s).toBe('instagram');
  });
});

describe('Unfertige Einträge im Entwurf', () => {
  it('a new link without target can be saved as draft, is not rendered, and blocks publishing', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const p = (await ed.call('POST', '/api/v1/pages', { name: 'M', slug: 'muster', preset: 'editorial', template: 'leer' })).json;
    const content = p.draft.content;
    content.profile.name = 'Muster';
    content.blocks.push({ id: 'neu00001', type: 'link', enabled: true, visibleFrom: null, visibleUntil: null, title: 'Neuer Link', description: '', url: '', icon: null, imageAssetId: null });
    content.blocks.push({ id: 'neu00002', type: 'action', enabled: true, visibleFrom: null, visibleUntil: null, kind: 'booking', label: 'Termin', value: '' });
    const s = await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content, rev: p.draft.rev });
    expect(s.status).toBe(200);
    const prev = await ed.call('GET', `/api/v1/pages/${p.id}/preview`);
    expect(prev.body).not.toContain('Neuer Link');
    const pub = await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
    expect(pub.status).toBe(422);
    expect(pub.json.error.code).toBe('target_missing');
    expect(pub.json.error.message).toContain('Neuer Link');
  });
});
