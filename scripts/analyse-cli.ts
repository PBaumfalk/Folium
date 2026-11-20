/** Entwicklerwerkzeug: Homepage-Analyse ohne KI ausführen. npx tsx scripts/analyse-cli.ts <url> [ausgabeordner] */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { analyzeHomepage } from '../src/server/analysis/index.js';
import { loadConfig } from '../src/server/config.js';
import { createLogger } from '../src/server/lib/log.js';

const [url = 'https://www.example.com/', out = '.'] = process.argv.slice(2);
const server = process.env.BROWSER_WS_URL ? null : await chromium.launchServer({ headless: true });
const cfg = loadConfig({ ...process.env, BROWSER_WS_URL: process.env.BROWSER_WS_URL ?? server!.wsEndpoint() });
const a = await analyzeHomepage(url, 0, cfg, createLogger('warn'));
fs.mkdirSync(out, { recursive: true });
if (a.screenshots) {
  fs.writeFileSync(path.join(out, 'analyse-mobil.png'), a.screenshots.mobile);
  fs.writeFileSync(path.join(out, 'analyse-desktop.png'), a.screenshots.desktop);
}
console.log(JSON.stringify({ ...a, screenshots: !!a.screenshots, features: { ...a.features, textSample: a.features.textSample.slice(0, 200) + ' …' } }, null, 1));
await server?.close();
