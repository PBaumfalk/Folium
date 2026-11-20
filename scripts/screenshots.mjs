// Bildschirmfotos für Handbuch und Sichtprüfung. Erwartet laufende Demo (npx tsx scripts/demo.ts) mit AI_PROVIDER=fake.
import { chromium } from 'playwright-core';
const A = 'http://localhost:18081', P = 'http://localhost:18080', out = 'docs/screenshots';
const b = await chromium.launch();
const shot = async (url, name, w, h, full = false, login = null, act = null) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, locale: 'de-DE' });
  const p = await ctx.newPage();
  if (login) {
    await p.goto(A); await p.fill('input[type=email]', login); await p.fill('input[type=password]', 'demo-passwort-123');
    await p.click('button:has-text("Anmelden")'); await p.waitForSelector('h1:has-text("Linkseiten")');
  }
  await p.goto(url); await p.waitForTimeout(1500);
  if (act) await act(p);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  await ctx.close();
};
const adm = 'admin@example.test';
for (const s of ['muster', 'boutique', 'signature']) {
  await shot(`${P}/${s}`, `oeffentlich-${s}-smartphone`, 390, 844);
  await shot(`${P}/${s}`, `oeffentlich-${s}-desktop`, 1440, 900);
}
await shot(`${P}/gibtsnicht`, 'oeffentlich-404', 390, 600);
await shot(A, 'anmeldung', 1280, 800);
await shot(A, 'anmeldung-fehler', 1280, 800, false, null, async (p) => { await p.fill('input[type=email]', 'x@y.de'); await p.fill('input[type=password]', 'falsch'); await p.click('button:has-text("Anmelden")'); await p.waitForTimeout(800); });
await shot(`${A}/`, 'seiten', 1440, 900, false, adm);
await shot(`${A}/seiten/1`, 'editor', 1440, 900, false, adm);
await shot(`${A}/seiten/1`, 'editor-smartphone', 390, 844, true, adm);
await shot(`${A}/seiten/1/design`, 'design', 1440, 900, false, adm);
await shot(`${A}/seiten/1/versionen`, 'versionen', 1440, 900, false, adm);
await shot(`${A}/seiten/1/teilen`, 'teilen', 1440, 900, false, adm);
await shot(`${A}/statistik`, 'statistik', 1440, 1000, false, adm);
await shot(`${A}/papierkorb`, 'papierkorb-leer', 1440, 700, false, adm);
await shot(`${A}/einstellungen/ki`, 'einstellungen-ki', 1440, 900, false, adm);
await shot(`${A}/`, 'neue-seite', 1440, 900, false, adm, async (p) => { await p.click('button:has-text("Neue Seite")'); await p.waitForTimeout(500); });
await shot(`${A}/seiten/1/design`, 'analyse-laeuft', 1440, 900, false, adm, async (p) => {
  await p.click('button:has-text("Design aus Homepage übernehmen")'); await p.fill('input[inputmode=url]', 'http://localhost:18090/');
  await p.click('button:has-text("Homepage untersuchen")'); await p.waitForTimeout(400);
});
await shot(`${A}/seiten/1/design`, 'analyse-pruefen', 1440, 1000, false, adm, async (p) => {
  await p.click('button:has-text("Design aus Homepage übernehmen")'); await p.fill('input[inputmode=url]', 'http://localhost:18090/');
  await p.click('button:has-text("Homepage untersuchen")'); await p.waitForSelector('text=Bitte prüfen, was übertragen wird', { timeout: 60000 }); await p.waitForTimeout(800);
});
await shot(`${A}/seiten/1/design`, 'analyse-varianten', 1440, 1000, false, adm, async (p) => {
  await p.click('button:has-text("Design aus Homepage übernehmen")'); await p.fill('input[inputmode=url]', 'http://localhost:18090/');
  await p.click('button:has-text("Homepage untersuchen")'); await p.waitForSelector('text=Bitte prüfen', { timeout: 60000 });
  await p.click('button:has-text("senden")'); await p.waitForSelector('text=Visuelle Identität', { timeout: 60000 }); await p.waitForTimeout(2500);
  await p.locator('text=Visuelle Identität').scrollIntoViewIfNeeded(); await p.mouse.wheel(0, 380); await p.waitForTimeout(400);
});
await shot(`${A}/seiten/1/design`, 'analyse-blockiert', 1440, 800, false, adm, async (p) => {
  await p.click('button:has-text("Design aus Homepage übernehmen")'); await p.fill('input[inputmode=url]', 'http://192.168.178.1/');
  await p.click('button:has-text("Homepage untersuchen")'); await p.waitForTimeout(1200);
});
await b.close();
console.log('fertig');
