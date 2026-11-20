import archiver from 'archiver';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

let mock: http.Server;
let mockUrl = '';
const seen: { url: string; auth: string; body: string }[] = [];
beforeAll(async () => {
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', auth: String(req.headers.authorization), body });
      if (req.headers.authorization !== 'Bearer gutes-token') return res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"message":"nein"}}');
      if (req.url === '/api/v1/links') return res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 7, shortUrl: 'https://go.example.test/linkseite' }));
      if (req.url === '/api/codes') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'abc123' }));
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
  mockUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => mock.close(() => r())));

async function published(env: Record<string, string> = {}) {
  const t = await makeApp(env);
  const ed = await t.loginAs('editor');
  const p = (await ed.call('POST', '/api/v1/pages', { name: 'Muster', slug: 'muster', preset: 'editorial', template: 'organisation' })).json;
  await ed.call('POST', `/api/v1/pages/${p.id}/publish`, {});
  return { t, ed, p };
}

describe('Teilen', () => {
  it('qr code png and svg point to public url with src=qr', async () => {
    const { ed, p } = await published();
    const png = await ed.call('GET', `/api/v1/pages/${p.id}/qr?format=png&size=600`);
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    const svg = await ed.call('GET', `/api/v1/pages/${p.id}/qr?format=svg`);
    expect(svg.body).toContain('<svg');
    const info = await ed.call('GET', `/api/v1/pages/${p.id}/share`);
    expect(info.json.qrUrl).toBe('http://links.test/muster?src=qr');
  });

  it('share buttons hidden when filum/tessera not configured', async () => {
    const { ed, p } = await published();
    const s = (await ed.call('GET', '/api/v1/session')).json;
    expect(s.integrations.filum).toBe(false);
    expect(s.integrations.tessera).toBe(false);
    expect((await ed.call('POST', `/api/v1/pages/${p.id}/filum`, {})).status).toBe(409);
  });

  it('filum call uses bearer token and returns short url (simuliert: lokaler Testserver)', async () => {
    const { ed, p } = await published({ FILUM_URL: mockUrl, FILUM_TOKEN: 'gutes-token', TESSERA_URL: mockUrl, TESSERA_TOKEN: 'gutes-token' });
    const r = await ed.call('POST', `/api/v1/pages/${p.id}/filum`, {});
    expect(r.status, r.body).toBe(200);
    expect(r.json.shortUrl).toBe('https://go.example.test/linkseite');
    const sent = seen.find((x) => x.url === '/api/v1/links')!;
    expect(sent.auth).toBe('Bearer gutes-token');
    expect(JSON.parse(sent.body).url).toBe('http://links.test/muster');
    const tr = await ed.call('POST', `/api/v1/pages/${p.id}/tessera`, {});
    expect(tr.json.editorUrl).toBe(`${mockUrl}/codes/abc123`);
  });

  it('filum errors are mapped to a readable message', async () => {
    const { ed, p } = await published({ FILUM_URL: mockUrl, FILUM_TOKEN: 'falsch' });
    const r = await ed.call('POST', `/api/v1/pages/${p.id}/filum`, {});
    expect(r.status).toBe(502);
    expect(r.json.error.message).toMatch(/Filum/);
  });
});

describe('Export und Import', () => {
  it('export then import recreates pages with assets', async () => {
    const { t, ed, p } = await published();
    const img = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#0B7032' } }).png().toBuffer();
    const a = await t.ctx.assets.store(img, 'Bild', null);
    const c = { ...p.draft.content, profile: { ...p.draft.content.profile, logoAssetId: a.id } };
    const cur = (await ed.call('GET', `/api/v1/pages/${p.id}`)).json;
    await ed.call('PATCH', `/api/v1/pages/${p.id}`, { content: c, rev: cur.draft.rev });
    const zip = await ed.call('GET', '/api/v1/export');
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');

    const t2 = await makeApp();
    const admin = await t2.loginAs('admin');
    const buf = Buffer.from(zip.body, 'binary');
    const raw = (await t.app.adminServer.inject({ method: 'GET', url: '/api/v1/export', headers: { cookie: ed.cookie } })).rawPayload;
    expect(buf.length).toBeGreaterThan(0);
    const r = await admin.call('POST', '/api/v1/import', raw, { 'content-type': 'application/zip' });
    expect(r.status, r.body).toBe(200);
    expect(r.json.created).toHaveLength(1);
    const pages = (await admin.call('GET', '/api/v1/pages')).json;
    expect(pages[0].slug).toBe('muster');
    const logo = pages[0].draft.content.profile.logoAssetId;
    expect(logo).toBeTruthy();
    expect(t2.ctx.assets.get(logo)).toBeDefined();
    // zweiter Import: neue Adresse statt Überschreiben
    const r2 = await admin.call('POST', '/api/v1/import', raw, { 'content-type': 'application/zip' });
    expect(r2.json.created[0].slug).toBe('muster-import');
  });

  it('import rejects zip slip and garbage', async () => {
    const t = await makeApp();
    const admin = await t.loginAs('admin');
    const evil = await new Promise<Buffer>((resolve) => {
      const arc = archiver('zip');
      const chunks: Buffer[] = [];
      arc.on('data', (d: Buffer) => chunks.push(d));
      arc.on('end', () => {
        // Pfad nachträglich byteweise auf ../../ setzen (archiver bereinigt ihn sonst)
        const b = Buffer.concat(chunks);
        resolve(Buffer.from(b.toString('latin1').replaceAll('aa/aa/etc/passwd', '../../etc/passwd'), 'latin1'));
      });
      arc.append('{"formatVersion":1,"pages":[],"assets":[]}', { name: 'folium-export.json' });
      arc.append('boese', { name: 'aa/aa/etc/passwd' });
      void arc.finalize();
    });
    expect((await admin.call('POST', '/api/v1/import', evil, { 'content-type': 'application/zip' })).status).toBe(422);
    expect((await admin.call('POST', '/api/v1/import', Buffer.from('kein zip'), { 'content-type': 'application/zip' })).status).toBe(422);
  });
});

describe('Sicherungen und Einstellungen', () => {
  it('backup and restore round trip', async () => {
    const { t, ed, p } = await published();
    const admin = await t.loginAs('admin');
    const b = await admin.call('POST', '/api/v1/backups', {});
    expect(b.status, b.body).toBe(200);
    await ed.call('DELETE', `/api/v1/pages/${p.id}`);
    const list = (await admin.call('GET', '/api/v1/backups')).json;
    expect(list.length).toBeGreaterThan(0);
    const r = await admin.call('POST', `/api/v1/backups/${encodeURIComponent(list[0].name)}/restore`, {});
    expect(r.status).toBe(200);
    expect(r.json.message).toMatch(/Neustart/);
    // Neustart simulieren: gestagte Wiederherstellung anwenden
    const { applyStagedRestore } = await import('../src/server/services/backup.js');
    await t.app.close();
    const res = applyStagedRestore(t.ctx.config);
    expect(res.restored).toBe(true);
    expect(fs.existsSync(t.ctx.config.dbPath)).toBe(true);
  });

  it('settings: editor reads, only admin writes; invalid url rejected', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    expect((await ed.call('GET', '/api/v1/settings')).json.homepageUrl).toBe('');
    expect((await ed.call('PATCH', '/api/v1/settings', { homepageUrl: 'https://x.de/' })).status).toBe(403);
    const a = await t.loginAs('admin');
    expect((await a.call('PATCH', '/api/v1/settings', { imprintUrl: 'javascript:alert(1)' })).status).toBe(422);
    expect((await a.call('PATCH', '/api/v1/settings', { homepageUrl: 'https://beispiel.de/' })).json.homepageUrl).toBe('https://beispiel.de/');
  });

  it('custom domain serves assigned page at root', async () => {
    const { t, p } = await published();
    const a = await t.loginAs('admin');
    expect((await a.call('POST', '/api/v1/domains', { host: 'links.anwalt.test', pageId: p.id })).status).toBe(200);
    const r = await t.pub('/', { host: 'links.anwalt.test' });
    expect(r.status).toBe(200);
    expect(r.body).toContain('Muster');
    expect((await a.call('POST', '/api/v1/domains', { host: 'http://evil/', pageId: p.id })).status).toBe(422);
  });
});
