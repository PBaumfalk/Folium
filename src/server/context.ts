import type { DesignAiProvider } from './ai/provider.js';
import type { Config } from './config.js';
import type { DB } from './db/db.js';
import type { Logger } from './lib/log.js';
import type { Assets } from './services/assets.js';
import type { Audit } from './services/audit.js';
import type { Backups } from './services/backup.js';
import type { Auth } from './services/auth.js';
import type { Pages } from './services/pages.js';
import type { SettingsStore } from './services/settings.js';
import type { Stats } from './services/stats.js';


export interface Ctx {
  config: Config;
  db: DB;
  log: Logger;
  settings: SettingsStore;
  audit: Audit;
  auth: Auth;
  pages: Pages;
  assets: Assets;
  stats: Stats;
  backups: Backups;
  ai: DesignAiProvider | null;
  startedAt: number;
  // Spätere Dienste hängen sich hier an (siehe app.ts).
  [service: string]: unknown;
}
