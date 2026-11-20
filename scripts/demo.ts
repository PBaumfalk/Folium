/**
 * Startet Folium mit drei erfundenen Beispielseiten (Café, Yoga-Studio, Tischlerei; je eine Designrichtung) für Entwicklung,
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
import { newBlockId, type Block } from '../src/shared/content.js';
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
  const admin = await ctx.auth.createUser({ email: 'admin@example.test', name: 'Demo-Admin', role: 'admin', password: 'demo-passwort-123' });
  await ctx.auth.createUser({ email: 'redaktion@example.test', name: 'Redaktion (Demo)', role: 'editor', password: 'demo-passwort-123' });
  await ctx.auth.createUser({ email: 'ansicht@example.test', name: 'Ansicht (Demo)', role: 'viewer', password: 'demo-passwort-123' });
  ctx.db.prepare("DELETE FROM meta WHERE key = 'setup_code'").run();
  ctx.settings.update({ imprintUrl: 'https://www.example.com/impressum/', privacyUrl: 'https://www.example.com/datenschutz/', homepageUrl: 'https://www.example.com/' });
  const p = { userId: admin.id, role: 'admin' as const, label: admin.email };
  const svg = (f: string) => fs.readFileSync(path.resolve('scripts/demo-assets', f));
  const png = async (buf: Buffer, width: number) => sharp(buf, { density: 144 }).resize({ width }).png().toBuffer();
  const cover = await ctx.assets.store(await png(svg('titelbild.svg'), 1600), 'Titelbild', p);
  const bildA = await ctx.assets.store(await png(svg('bild-gespraech.svg'), 1200), 'Bild A', p);
  const bildB = await ctx.assets.store(await png(svg('bild-unterlagen.svg'), 1200), 'Bild B', p);
  // Schlichtes Wortzeichen je Beispiel (Kreis mit Initiale, Name, Zusatz)
  const logo = (initial: string, name: string, sub: string, color: string) =>
    ctx.assets.store(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(360, 116 + name.length * 19)} 96" role="img" aria-label="${name}"><circle cx="48" cy="48" r="38" fill="none" stroke="${color}" stroke-width="6"/><text x="48" y="62" text-anchor="middle" font-family="Georgia, serif" font-size="40" font-weight="700" fill="${color}">${initial}</text><text x="104" y="52" font-family="Georgia, serif" font-size="32" font-weight="700" fill="#1D1D1B">${name}</text><text x="104" y="82" font-family="Georgia, serif" font-size="20" fill="${color}">${sub}</text></svg>`),
      `Logo ${name}`,
      p,
    );
  const B = { enabled: true, visibleFrom: null, visibleUntil: null };
  const id = () => newBlockId();
  const hp = 'https://www.example.com';
  type Ex = { slug: string; name: string; preset: PresetId; logo: string; profile: { name: string; tagline: string; details: string[] }; blocks: Block[] };
  const beispiele: Ex[] = [
    {
      slug: 'cafe', name: 'Café Lindenblatt', preset: 'editorial', logo: (await logo('L', 'Lindenblatt', 'Café & Backstube', '#0B7032')).id,
      profile: { name: 'Café Lindenblatt', tagline: 'Frühstück, Kuchen aus eigener Backstube und guter Kaffee am Marktplatz.', details: ['Täglich frisch gebacken', 'Plätze im Hof'] },
      blocks: [
        { id: id(), ...B, type: 'action', kind: 'call', label: 'Tisch reservieren: 030 123 456 70', value: '+493012345670' },
        { id: id(), ...B, type: 'action', kind: 'booking', label: 'Online reservieren', value: `${hp}/reservieren/` },
        { id: id(), ...B, type: 'contact', phone: null, email: null, hours: 'Di.–So. 8–18 Uhr, montags Ruhetag' },
        { id: id(), ...B, type: 'heading', text: 'Bei uns' },
        { id: id(), ...B, type: 'link', title: 'Speisekarte', description: 'Frühstück, Mittagstisch und Kuchen der Woche.', url: `${hp}/speisekarte/`, icon: 'book-open', imageAssetId: bildB.id },
        { id: id(), ...B, type: 'link', title: 'Torten bestellen', description: 'Für Geburtstage und Feiern, mit drei Tagen Vorlauf.', url: `${hp}/torten/`, icon: 'star', imageAssetId: bildA.id },
        { id: id(), ...B, type: 'link', title: 'Gutscheine', description: 'Im Café oder online erhältlich.', url: `${hp}/gutscheine/`, icon: 'euro', imageAssetId: null },
        { id: id(), ...B, type: 'location', name: 'Am Marktplatz', role: '', address: 'Marktplatz 3\n12345 Musterstadt', routeUrl: 'https://www.openstreetmap.org/search?query=Marktplatz%203%2012345%20Musterstadt', note: 'Fahrradständer vor der Tür.' },
        { id: id(), ...B, type: 'social', items: [{ network: 'instagram', url: 'https://www.instagram.com/' }, { network: 'facebook', url: 'https://www.facebook.com/' }] },
      ],
    },
    {
      slug: 'studio', name: 'Studio Wellenform', preset: 'boutique', logo: (await logo('W', 'Wellenform', 'Yoga & Pilates', '#0B7032')).id,
      profile: { name: 'Studio Wellenform', tagline: 'Yoga und Pilates in kleinen Gruppen, für Einsteiger und Geübte.', details: ['Kurse morgens und abends'] },
      blocks: [
        { id: id(), ...B, type: 'action', kind: 'booking', label: 'Probestunde buchen', value: `${hp}/probestunde/` },
        { id: id(), ...B, type: 'action', kind: 'call', label: 'Anrufen', value: '+493012345671' },
        { id: id(), ...B, type: 'action', kind: 'email', label: 'Schreiben', value: 'hallo@example.com' },
        { id: id(), ...B, type: 'heading', text: 'Kurse' },
        { id: id(), ...B, type: 'link', title: 'Kursplan', description: 'Alle Termine dieser Woche.', url: `${hp}/kursplan/`, icon: 'calendar', imageAssetId: bildA.id },
        { id: id(), ...B, type: 'link', title: 'Preise und Karten', description: '10er-Karte, Monatsabo, Firmenkurse.', url: `${hp}/preise/`, icon: 'euro', imageAssetId: bildB.id },
        { id: id(), ...B, type: 'link', title: 'Online-Stunden', description: 'Live per Video oder als Aufzeichnung.', url: `${hp}/online/`, icon: 'video', imageAssetId: null },
        { id: id(), ...B, type: 'social', items: [{ network: 'instagram', url: 'https://www.instagram.com/' }, { network: 'youtube', url: 'https://www.youtube.com/' }] },
      ],
    },
    {
      slug: 'tischlerei', name: 'Tischlerei Holm', preset: 'signature', logo: (await logo('H', 'Tischlerei Holm', 'Meisterbetrieb seit 1987', '#0B7032')).id,
      profile: { name: 'Tischlerei Holm', tagline: 'Möbel nach Maß, Treppen, Fenster und Türen aus der eigenen Werkstatt.', details: ['Meisterbetrieb in zweiter Generation'] },
      blocks: [
        { id: id(), ...B, type: 'action', kind: 'call', label: 'Anrufen: 030 123 456 72', value: '+493012345672' },
        { id: id(), ...B, type: 'action', kind: 'contact', label: 'Angebot anfragen', value: `${hp}/anfrage/` },
        { id: id(), ...B, type: 'action', kind: 'email', label: 'E-Mail schreiben', value: 'werkstatt@example.com' },
        { id: id(), ...B, type: 'contact', phone: null, email: null, hours: 'Mo.–Fr. 7–16 Uhr, Beratung nach Vereinbarung' },
        { id: id(), ...B, type: 'heading', text: 'Was wir bauen' },
        { id: id(), ...B, type: 'link', title: 'Möbel nach Maß', description: 'Einbauschränke, Küchen und Regale.', url: `${hp}/moebel/`, icon: 'building', imageAssetId: null },
        { id: id(), ...B, type: 'link', title: 'Treppen und Türen', description: 'Aus heimischem Holz, auf Wunsch mit Montage.', url: `${hp}/treppen/`, icon: 'shield-check', imageAssetId: null },
        { id: id(), ...B, type: 'link', title: 'Referenzen', description: 'Fotos abgeschlossener Arbeiten.', url: `${hp}/referenzen/`, icon: 'star', imageAssetId: null },
        { id: id(), ...B, type: 'link', title: 'Ausbildung', description: 'Wir bilden aus. Bewerbungen jederzeit.', url: `${hp}/ausbildung/`, icon: 'users', imageAssetId: null },
        { id: id(), ...B, type: 'heading', text: 'Werkstatt' },
        { id: id(), ...B, type: 'location', name: 'Werkstatt', role: 'mit Ausstellung', address: 'Gewerbering 12\n12345 Musterstadt', routeUrl: 'https://www.openstreetmap.org/search?query=Gewerbering%2012%2012345%20Musterstadt', note: 'Parkplätze auf dem Hof.' },
      ],
    },
  ];
  for (const ex of beispiele) {
    const page = ctx.pages.create({ name: ex.name, slug: ex.slug, preset: ex.preset, template: 'leer' }, p);
    const c = page.draft.content;
    c.profile = { ...c.profile, ...ex.profile, logoAssetId: ex.logo, coverAssetId: cover.id };
    c.blocks = ex.blocks;
    ctx.pages.saveDraft(page.id, { content: c, rev: page.draft.rev }, p);
    ctx.pages.publish(page.id, 'Demo', p);
  }
  console.log('Demo-Daten angelegt. Anmeldung: admin@example.test / demo-passwort-123');
}

// Erfundene Beispiel-Homepage für „Design aus Homepage übernehmen“
const fixture = path.resolve('tests/fixtures/homepage');
const homepage = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const file =
    url === '/' ? path.join(fixture, 'index.html')
    : url === '/assets/stil.css' ? path.join(fixture, 'stil.css')
    : url === '/assets/logo/lindenblatt-logo.svg' ? path.join(fixture, 'assets/logo/lindenblatt-logo.svg')
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
console.log(`Öffentlich: ${config.publicBaseUrl}/cafe  ·  Verwaltung: ${config.appUrl}  ·  Beispiel-Homepage: http://localhost:${homepagePort}/`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, async () => { homepage.close(); await app.close(); process.exit(0); });
