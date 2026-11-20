import { chromium, type Browser } from 'playwright-core';
import type { Logger } from '../lib/log.js';
import { FetchBlockedError, safeFetch, type FetchBudget, type FetchPolicy } from '../lib/safefetch.js';
import type { ComputedSnapshot } from './extract.js';

/**
 * Bildschirmfotos und berechnete Stile aus einem entfernten, abgeschotteten Chromium
 * (Dienst „folium-browser“ ohne Internetzugang). Der Browser baut selbst keine Verbindung auf:
 * Jede Anfrage wird abgefangen und von Folium über den SSRF-geschützten Abruf beantwortet.
 */

// Läuft im Browser der analysierten Seite. Reiner Text, damit nichts aus Node mitgeschickt wird.
const SNAPSHOT_SCRIPT = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.1; };
  const cs = (el) => getComputedStyle(el);
  const transparent = (c) => !c || c === 'transparent' || /rgba\\([^)]*,\\s*0\\)$/.test(c);
  let bg = cs(document.body).backgroundColor;
  if (transparent(bg)) bg = cs(document.documentElement).backgroundColor;
  if (transparent(bg)) bg = 'rgb(255, 255, 255)';
  const b = cs(document.body);
  const headings = [...document.querySelectorAll('h1,h2')].filter(vis).slice(0, 3).map((h) => { const s = cs(h); return { tag: h.tagName.toLowerCase(), color: s.color, fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize }; });
  const link = [...document.querySelectorAll('main a, article a, p a')].find(vis) || [...document.querySelectorAll('a')].find(vis);
  const sel = (el) => el.tagName.toLowerCase() + [...el.classList].slice(0, 3).map((c) => '.' + c).join('');
  const cand = [...document.querySelectorAll('a[href^="tel:"], button, .btn, .button, [class*="knopf"], [class*="btn"], [class*="cta"], a[class*="button"], input[type=submit]')].filter(vis);
  const buttons = cand.map((el) => { const s = cs(el); const r = el.getBoundingClientRect(); return { el, s, area: r.width * r.height }; })
    .filter((x) => !transparent(x.s.backgroundColor) || (x.s.borderStyle !== 'none' && parseFloat(x.s.borderWidth) > 0))
    .sort((a, z) => z.area - a.area).slice(0, 6)
    .map(({ el, s }) => ({ selector: sel(el), text: (el.innerText || el.value || '').trim().slice(0, 40), bg: s.backgroundColor, color: s.color, radius: s.borderRadius, border: s.borderWidth + ' ' + s.borderStyle + ' ' + s.borderColor, padding: s.padding, fontWeight: s.fontWeight, fontFamily: s.fontFamily }));
  const H = Math.min(document.documentElement.scrollHeight, innerHeight * 3);
  const W = innerWidth;
  const areas = new Map();
  let imageArea = 0;
  const all = document.body.querySelectorAll('*');
  for (let i = 0; i < all.length && i < 3000; i++) {
    const el = all[i];
    const r = el.getBoundingClientRect();
    const top = Math.max(0, r.top + scrollY), bottom = Math.min(H, r.bottom + scrollY);
    const w = Math.max(0, Math.min(W, r.right) - Math.max(0, r.left));
    const a = Math.max(0, bottom - top) * w;
    if (a < 400) continue;
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE' || el.tagName === 'VIDEO') { imageArea += a; continue; }
    const c = cs(el).backgroundColor;
    if (!transparent(c)) areas.set(c, (areas.get(c) || 0) + a);
  }
  return {
    body: { bg, color: b.color, fontFamily: b.fontFamily, fontSize: b.fontSize },
    headings,
    link: link ? { color: cs(link).color } : null,
    buttons,
    areas: [...areas].map(([color, area]) => ({ color, area })).sort((a, z) => z.area - a.area).slice(0, 12),
    imageArea,
    viewportArea: W * H,
    textChars: (document.body.innerText || '').length,
  };
})()`;

const HIDE_OVERLAYS = `[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[class*="einwilligung" i],[id*="einwilligung" i],[id*="usercentrics" i],[class*="cmplz" i],[id*="borlabs" i]{display:none!important}`;

export interface Capture {
  mobile: Buffer;
  desktop: Buffer;
  computed: ComputedSnapshot;
  notes: string[];
  requests: number;
  blocked: number;
}

const MAX_SUB = 40;
/** Letzte Fehlerursache (für eine verständliche Meldung) */
export let lastError = '';

export async function captureScreenshots(url: string, wsEndpoint: string, policy: FetchPolicy, budget: FetchBudget, log: Logger): Promise<Capture | null> {
  if (!wsEndpoint) return null;
  let browser: Browser | null = null;
  const notes: string[] = [];
  let requests = 0;
  let blocked = 0;
  try {
    browser = await chromium.connect(wsEndpoint, { timeout: 8000 });
    const run = async (viewport: { width: number; height: number }, dpr: number) => {
      let used = 0;
      const ctx = await browser!.newContext({ viewport, deviceScaleFactor: dpr, serviceWorkers: 'block', acceptDownloads: false, permissions: [], locale: 'de-DE', timezoneId: 'Europe/Berlin', userAgent: policy.userAgent, javaScriptEnabled: true, bypassCSP: false });
      await ctx.route('**/*', async (route) => {
        const req = route.request();
        const u = req.url();
        if (req.method() !== 'GET' || !/^https?:/i.test(u)) return route.abort('blockedbyclient');
        const isDoc = req.resourceType() === 'document' && req.frame() === req.frame().page().mainFrame();
        if (!isDoc && used >= MAX_SUB) {
          blocked++;
          return route.abort('blockedbyclient');
        }
        used++;
        requests++;
        try {
          const type = req.resourceType();
          const max = type === 'document' ? 2_000_000 : type === 'stylesheet' || type === 'script' ? 1_000_000 : type === 'font' ? 1_000_000 : 5_000_000;
          const r = await safeFetch(u, policy, { maxBytes: max, budget, accept: req.headers().accept ?? '*/*', maxRedirects: 5 });
          return route.fulfill({ status: r.status, headers: { 'content-type': r.headers['content-type'] ?? 'application/octet-stream' }, body: r.body });
        } catch (e) {
          blocked++;
          if (e instanceof FetchBlockedError && e.reason === 'address') notes.push(`Eine Unterressource wurde blockiert (internes Ziel): ${new URL(u).host}`);
          return route.abort('blockedbyclient');
        }
      });
      await ctx.routeWebSocket(/.*/, (ws) => ws.close());
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: Math.max(3000, Math.min(20_000, budget.remainingMs() - 2000)) });
      await page.waitForTimeout(700);
      await page.addStyleTag({ content: HIDE_OVERLAYS }).catch(() => {});
      await page.waitForTimeout(150);
      const shot = await page.screenshot({ type: 'png', fullPage: false });
      const computed = viewport.width >= 1000 ? ((await page.evaluate(SNAPSHOT_SCRIPT)) as ComputedSnapshot) : null;
      await ctx.close();
      return { shot, computed };
    };
    const desktop = await run({ width: 1440, height: 900 }, 1);
    const mobile = await run({ width: 390, height: 844 }, 2);
    notes.push('Einwilligungsbanner wurden für die Bildschirmfotos ausgeblendet, soweit sie als solche erkennbar waren.');
    if (blocked) notes.push(`${blocked} Unterressourcen wurden nicht geladen (Begrenzung oder Schutzregel).`);
    return { desktop: desktop.shot, mobile: mobile.shot, computed: desktop.computed!, notes, requests, blocked };
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'Bildschirmfoto der Homepage fehlgeschlagen');
    lastError = (e as Error).message.slice(0, 200);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
