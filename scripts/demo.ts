/**
 * Startet Folium mit erfundenen Beispieldaten („Muster & Partner“ in allen drei Designs) für Entwicklung,
 * Bildschirmfotos und Browser-Tests. Aufruf: npx tsx scripts/demo.ts [datenverzeichnis]
 * Zusätzlich läuft auf Port 18090 eine erfundene Beispiel-Homepage (tests/fixtures/homepage) für
 * „Design aus Homepage übernehmen“.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { createLogger } from '../src/server/lib/log.js';
import type { PresetId } from '../src/shared/theme.js';

const dataDir = path.resolve(process.argv[2] ?? 'data-demo');
// Optional: lokaler Browser für Bildschirmfotos (nur Entwicklung; im Betrieb der Dienst folium-browser)
const localBrowser = process.env.DEMO_BROWSER === '1' ? await (await import('playwright-core')).chromium.launchServer({ headless: true }) : null;
const fresh = !fs.existsSync(path.join(dataDir, 'folium.db'));
const config = loadConfig({
  ...process.env,
  DATA_DIR: dataDir,
  PUBLIC_PORT: process.env.PUBLIC_PORT ?? '18080',
  ADMIN_PORT: process.env.ADMIN_PORT ?? '18081',
  APP_URL: process.env.APP_URL ?? 'http://localhost:18081',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? 'http://localhost:18080',
  SETUP_CODE: process.env.SETUP_CODE ?? '111-222-333',
  // Die Beispiel-Homepage läuft lokal; nur in der Demo dürfen Analysen localhost erreichen.
  ANALYSIS_ALLOW_HOSTS: process.env.ANALYSIS_ALLOW_HOSTS ?? 'localhost,127.0.0.1,::1',
  HOST: '127.0.0.1',
  ...(localBrowser ? { BROWSER_WS_URL: localBrowser.wsEndpoint() } : {}),
});
const log = createLogger(process.env.LOG_LEVEL ?? 'warn');
const app = await createApp(config, log);

if (fresh && process.env.DEMO_EMPTY !== '1') {
  const { ctx } = app;
  const admin = await ctx.auth.createUser({ email: 'admin@example.test', name: 'Maria (Demo)', role: 'admin', password: 'demo-passwort-123' });
  await ctx.auth.createUser({ email: 'redaktion@example.test', name: 'Redaktion (Demo)', role: 'editor', password: 'demo-passwort-123' });
  await ctx.auth.createUser({ email: 'ansicht@example.test', name: 'Ansicht (Demo)', role: 'viewer', password: 'demo-passwort-123' });
  ctx.db.prepare("DELETE FROM meta WHERE key = 'setup_code'").run();
  ctx.settings.update({ imprintUrl: 'https://www.example.com/impressum/', privacyUrl: 'https://www.example.com/datenschutz/', homepageUrl: 'https://www.example.com/' });
  const p = { userId: admin.id, role: 'admin' as const, label: admin.email };
  const svg = (f: string) => fs.readFileSync(path.resolve('scripts/demo-assets', f));
  const png = async (f: string, width: number) => sharp(svg(f), { density: 144 }).resize({ width }).png().toBuffer();
  const logo = await ctx.assets.store(svg('logo.svg'), 'Logo Muster & Partner', p);
  const cover = await ctx.assets.store(await png('titelbild.svg', 1600), 'Titelbild', p);
  const gespraech = await ctx.assets.store(await png('bild-gespraech.svg', 1200), 'Gespräch', p);
  const unterlagen = await ctx.assets.store(await png('bild-unterlagen.svg', 1200), 'Unterlagen', p);
  const mk = (slug: string, name: string, preset: PresetId) => {
    const page = ctx.pages.create({ name, slug, preset, template: 'organisation' }, p);
    const c = page.draft.content;
    c.profile.logoAssetId = logo.id;
    c.profile.coverAssetId = cover.id;
    for (const b of c.blocks) {
      if (b.type === 'link' && b.title === 'Unsere Leistungen') b.imageAssetId = unterlagen.id;
      if (b.type === 'link' && b.title === 'Erstberatung') b.imageAssetId = gespraech.id;
    }
    ctx.pages.saveDraft(page.id, { content: c, rev: page.draft.rev }, p);
    ctx.pages.publish(page.id, 'Demo', p);
  };
  mk('muster', 'Muster & Partner (Editorial)', 'editorial');
  mk('boutique', 'Muster & Partner (Boutique)', 'boutique');
  mk('signature', 'Muster & Partner (Signature)', 'signature');
  console.log('Demo-Daten angelegt. Anmeldung: admin@example.test / demo-passwort-123');
}

// Erfundene Beispiel-Homepage für „Design aus Homepage übernehmen“
const fixture = path.resolve('tests/fixtures/homepage');
const homepage = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const file =
    url === '/' ? path.join(fixture, 'index.html')
    : url === '/assets/stil.css' ? path.join(fixture, 'stil.css')
    : url === '/assets/logo/muster-logo.svg' ? path.join(fixture, 'assets/logo/muster-logo.svg')
    : url.startsWith('/fonts/') && /^[\w.-]+$/.test(url.slice(7)) ? path.resolve('fonts', url.slice(7))
    : null;
  if (!file || !fs.existsSync(file)) return res.writeHead(404).end();
  const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'font/ttf';
  res.writeHead(200, { 'content-type': type }).end(fs.readFileSync(file));
});
const homepagePort = Number(process.env.DEMO_HOMEPAGE_PORT ?? 18090);
await new Promise<void>((r) => {
  homepage.once('error', (e) => { console.warn(`Beispiel-Homepage nicht gestartet: ${e.message}`); r(); });
  homepage.listen(homepagePort, '127.0.0.1', r);
});

await app.publicServer.listen({ port: config.publicPort, host: '127.0.0.1' });
await app.adminServer.listen({ port: config.adminPort, host: '127.0.0.1' });
app.start();
console.log(`Öffentlich: ${config.publicBaseUrl}/muster  ·  Verwaltung: ${config.appUrl}  ·  Beispiel-Homepage: http://localhost:${homepagePort}/`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { homepage.close(); await app.close(); process.exit(0); });
