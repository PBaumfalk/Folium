import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../src/server/services/svg.js';
import { makeApp } from './helpers.js';

function multipart(name: string, type: string, data: Buffer, field = 'file') {
  const boundary = '----folium' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const pngWithExif = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: '#0B7032' } })
    .withExif({ IFD0: { Copyright: 'GEHEIM-EXIF', Artist: 'Max Mustermann' } })
    .jpeg()
    .toBuffer();

describe('Uploads', () => {
  it('accepts jpeg, re-encodes to webp sizes and strips metadata', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const src = await pngWithExif();
    expect(src.includes(Buffer.from('GEHEIM-EXIF'))).toBe(true);
    const m = multipart('Mandant Foto.jpg', 'image/jpeg', src);
    const r = await ed.call('POST', '/api/v1/assets', m.body, m.headers);
    expect(r.status, r.body).toBe(200);
    expect(r.json.kind).toBe('image');
    expect(r.json.width).toBe(900);
    const files = fs.readdirSync(t.ctx.config.assetDir);
    expect(files.some((f) => f.endsWith('-800.webp'))).toBe(true);
    for (const f of files) {
      expect(f).not.toContain('Mandant');
      expect(fs.readFileSync(`${t.ctx.config.assetDir}/${f}`).includes(Buffer.from('GEHEIM-EXIF'))).toBe(false);
    }
    // öffentlich abrufbar über den Hash
    const pubRes = await t.pub(`/assets/${r.json.id}-800.webp`);
    expect(pubRes.status).toBe(200);
    expect(pubRes.headers['content-type']).toBe('image/webp');
  });

  it('rejects file with wrong magic bytes', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const m = multipart('fake.png', 'image/png', Buffer.from('<?php echo "hallo"; ?>'));
    const r = await ed.call('POST', '/api/v1/assets', m.body, m.headers);
    expect(r.status).toBe(415);
  });

  it('rejects files over 5 MB with 413', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const m = multipart('gross.png', 'image/png', Buffer.alloc(5 * 1024 * 1024 + 10, 1));
    const r = await ed.call('POST', '/api/v1/assets', m.body, m.headers);
    expect(r.status).toBe(413);
  });

  it('viewer cannot upload', async () => {
    const t = await makeApp();
    const v = await t.loginAs('viewer');
    const m = multipart('a.jpg', 'image/jpeg', await pngWithExif());
    expect((await v.call('POST', '/api/v1/assets', m.body, m.headers)).status).toBe(403);
  });

  it('accepts woff2 font and serves it', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const m = multipart('Hausschrift.woff2', 'font/woff2', fs.readFileSync('fonts/hanken-grotesk-latin-wght-normal.woff2'));
    const r = await ed.call('POST', '/api/v1/assets', m.body, m.headers);
    expect(r.status, r.body).toBe(200);
    expect(r.json.kind).toBe('font');
    expect((await t.pub(`/assets/${r.json.id}.woff2`)).headers['content-type']).toBe('font/woff2');
  });

  it('svg upload is sanitized and served with restrictive CSP', async () => {
    const t = await makeApp();
    const ed = await t.loginAs('editor');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><path d="M0 0h10v10z" fill="#0B7032"/></svg>');
    const m = multipart('logo.svg', 'image/svg+xml', svg);
    const r = await ed.call('POST', '/api/v1/assets', m.body, m.headers);
    expect(r.status, r.body).toBe(200);
    const pubRes = await t.pub(`/assets/${r.json.id}.svg`);
    expect(pubRes.body).not.toContain('script');
    expect(pubRes.body).not.toContain('onload');
    expect(pubRes.body).toContain('<path');
    expect(String(pubRes.headers['content-security-policy'])).toContain("default-src 'none'");
  });
});

describe('SVG-Bereinigung', () => {
  it('removes script, event handlers, foreignObject, external href and javascript urls', () => {
    const dirty =
      '<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">' +
      '<script>alert(1)</script><foreignObject><div>x</div></foreignObject>' +
      '<a href="javascript:alert(1)"><path d="M0 0"/></a>' +
      '<use href="https://evil.example/x.svg#a"/><use xlink:href="#ok"/>' +
      '<rect width="1" height="1" onclick="alert(1)" style="fill:url(https://evil.example)"/>' +
      '<image href="https://evil.example/track.png"/>' +
      '<g id="ok"><path d="M1 1" fill="#fff"/></g></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/script|foreignObject|javascript|evil\.example|onclick|<image|<a /i);
    expect(clean).toContain('<use xlink:href="#ok"');
    expect(clean).toContain('<rect width="1" height="1"');
    expect(clean).toContain('<g id="ok"><path d="M1 1" fill="#fff"/></g>');
  });

  it('rejects non-svg input', () => {
    expect(() => sanitizeSvg('<html><body>x</body></html>')).toThrow();
  });
});
