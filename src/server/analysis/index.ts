import crypto from 'node:crypto';
import type { Config } from '../config.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/log.js';
import { FetchBlockedError, FetchBudget, safeFetch, type FetchPolicy } from '../lib/safefetch.js';
import * as browser from './browser.js';
import { extractFeatures, stylesheetUrls, type Features } from './extract.js';

export interface Analysis {
  id: string;
  url: string;
  finalUrl: string;
  features: Features;
  screenshots: { mobile: Buffer; desktop: Buffer } | null;
  contentHash: string;
  fetchedAt: string;
  userId: number;
  stats: { requests: number; ms: number };
}

export const REASONS: Record<FetchBlockedError['reason'], string> = {
  scheme: 'Ungültige Adresse',
  port: 'Nicht erlaubter Port',
  address: 'Internes oder geschütztes Ziel',
  dns: 'Servername nicht auflösbar',
  redirects: 'Zu viele Weiterleitungen',
  size: 'Antwort zu groß',
  timeout: 'Zeitüberschreitung',
  budget: 'Abruflimit erreicht',
  status: 'Fehlerhafte Antwort',
};

export function analysisPolicy(config: Config): FetchPolicy {
  return {
    allowHosts: config.analysisAllowHosts,
    allowPrivate: config.analysisAllowPrivate,
    timeoutMs: 10_000,
    userAgent: 'Mozilla/5.0 (compatible; Folium-Designanalyse/1.0)',
  };
}

/** Untersucht eine Homepage: HTML, bis zu 10 Stylesheets, optional Bildschirmfotos und berechnete Stile. */
export async function analyzeHomepage(rawUrl: string, userId: number, config: Config, log: Logger, policyOverride?: FetchPolicy): Promise<Analysis> {
  const started = Date.now();
  let url: string;
  try {
    const u = new URL(rawUrl.trim().match(/^https?:\/\//i) ? rawUrl.trim() : `https://${rawUrl.trim()}`);
    url = u.toString();
  } catch {
    throw new AppError(422, 'invalid_url', 'Bitte eine gültige Adresse eingeben, z. B. https://www.example.com/.', 'url');
  }
  const policy = policyOverride ?? analysisPolicy(config);
  const budget = new FetchBudget({ maxRequests: 15, deadlineMs: 30_000 });
  const fail = (e: unknown): never => {
    if (e instanceof FetchBlockedError) throw new AppError(422, `blocked_${e.reason}`, `Die Homepage wurde nicht abgerufen: ${e.message}`, 'url', { reason: e.reason, label: REASONS[e.reason] });
    throw new AppError(502, 'unreachable', `Die Homepage ist nicht erreichbar (${(e as Error).message}).`, 'url');
  };

  const res = await safeFetch(url, policy, { maxBytes: 2_000_000, budget }).catch(fail);
  if (res.status < 200 || res.status >= 300) throw new AppError(502, 'bad_status', `Die Homepage antwortet mit Status ${res.status}.`, 'url');
  const type = res.headers['content-type'] ?? '';
  if (!/html/i.test(type)) throw new AppError(422, 'not_html', `Unter dieser Adresse liegt keine Webseite (Inhaltstyp ${type || 'unbekannt'}).`, 'url');
  const html = res.body.toString('utf8');

  const css: { url: string; text: string }[] = [];
  const notes: string[] = [];
  for (const href of stylesheetUrls(html, res.finalUrl).slice(0, 10)) {
    try {
      const r = await safeFetch(href, policy, { maxBytes: 1_000_000, budget, accept: 'text/css,*/*;q=0.1' });
      if (r.status === 200) css.push({ url: href, text: r.body.toString('utf8') });
    } catch (e) {
      notes.push(`Stylesheet nicht gelesen (${e instanceof FetchBlockedError ? REASONS[e.reason] : 'Fehler'}): ${href.slice(0, 120)}`);
    }
  }

  let capture = null;
  if (config.browserWsUrl) {
    const browserBudget = new FetchBudget({ maxRequests: 120, deadlineMs: 45_000 });
    capture = await browser.captureScreenshots(res.finalUrl, config.browserWsUrl, policy, browserBudget, log);
    if (!capture) notes.push(`Bildschirmfotos konnten nicht erstellt werden (${browser.lastError || 'Browser nicht erreichbar'}); analysiert wurden nur HTML und CSS.`);
  } else {
    notes.push('Kein Browser eingerichtet (BROWSER_WS_URL): keine Bildschirmfotos.');
  }

  const features = extractFeatures({ url: res.finalUrl, html, css, computed: capture?.computed ?? null });
  features.notes.push(...notes, ...(capture?.notes ?? []));
  return {
    id: crypto.randomBytes(12).toString('hex'),
    url,
    finalUrl: res.finalUrl,
    features,
    screenshots: capture ? { mobile: capture.mobile, desktop: capture.desktop } : null,
    contentHash: crypto.createHash('sha256').update(html).update(css.map((c) => c.text).join('')).digest('hex').slice(0, 32),
    fetchedAt: new Date().toISOString(),
    userId,
    stats: { requests: budget.count + (capture?.requests ?? 0), ms: Date.now() - started },
  };
}
