import fs from 'node:fs';
import type { Config } from './config.js';
import type { Ctx } from './context.js';
import { openDatabase } from './db/db.js';
import { setupCode } from './lib/crypto.js';
import type { Logger } from './lib/log.js';
import { buildAdminServer } from './admin/server.js';
import { buildPublicServer } from './public/server.js';
import { Audit } from './services/audit.js';
import { Auth } from './services/auth.js';
import { SettingsStore } from './services/settings.js';
import { Pages } from './services/pages.js';
import { registerPageRoutes } from './admin/routes/pages.js';
import { registerPublicPages } from './public/pages.js';
import { registerPublicAssets } from './public/assets.js';
import { Assets } from './services/assets.js';
import { registerAssetRoutes } from './admin/routes/assets.js';
import { registerPreviewRoutes } from './admin/routes/preview.js';
import { registerStatsRoutes } from './admin/routes/stats.js';
import { registerClick } from './public/click.js';
import { Stats } from './services/stats.js';
import { aiFromConfig } from './ai/anthropic.js';
import { registerDesignRoutes } from './admin/routes/design.js';
import { registerShareRoutes } from './admin/routes/share.js';
import { registerSettingsRoutes } from './admin/routes/settings.js';
import { registerOidcRoutes } from './admin/routes/oidc.js';
import { applyStagedRestore, Backups } from './services/backup.js';

export function ensureDataDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (e) {
    const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    throw new Error(
      `Das Datenverzeichnis ${dir} ist nicht beschreibbar (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}). ` +
        `Folium läuft als Benutzer-ID ${uid ?? 'unbekannt'}. Bei einem eingebundenen Host-Ordner die Rechte anpassen, z. B. sudo chown -R ${uid ?? 1000}:${uid ?? 1000} <pfad>.`,
    );
  }
}

export async function createApp(config: Config, log: Logger, opts: { applyRestore?: boolean } = {}) {
  ensureDataDir(config.dataDir);
  // Die Kommandozeile läuft neben dem Server und darf eine vorgemerkte Wiederherstellung nicht vorziehen
  const restore = opts.applyRestore === false ? { restored: false } : applyStagedRestore(config);
  if (restore.restored) log.warn({ previous: restore.previous }, 'Sicherung wiederhergestellt; der vorherige Stand wurde gesichert');
  fs.mkdirSync(config.assetDir, { recursive: true });
  const db = openDatabase(config.dbPath, log, config.backupDir);
  const setMeta = (k: string, v: string) => db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(k, v);
  const meta = (k: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(k) as { value: string } | undefined)?.value;

  const auth = new Auth(db);
  const settings = new SettingsStore(db);
  const ctx: Ctx = {
    config,
    db,
    log,
    settings,
    pages: new Pages(db, settings),
    assets: new Assets(db, config.assetDir),
    stats: new Stats(db, settings, log, config.timezone),
    backups: new Backups(db, config),
    audit: new Audit(db),
    auth,
    ai: aiFromConfig(config),
    startedAt: Date.now(),
  };

  if (auth.userCount() === 0) {
    const code = config.setupCode || meta('setup_code') || setupCode();
    setMeta('setup_code', code);
    log.warn(`Einrichtungscode: ${code} – unter ${config.appUrl} eingeben, um das erste Admin-Konto anzulegen.`);
  }

  const publicServer = await buildPublicServer(ctx, [registerClick, registerPublicAssets, registerPublicPages]);
  const adminServer = await buildAdminServer(ctx, [registerPageRoutes, registerAssetRoutes, registerPreviewRoutes, registerStatsRoutes, registerDesignRoutes, registerShareRoutes, registerSettingsRoutes, registerOidcRoutes]);
  const stoppers: (() => void | Promise<void>)[] = [];

  return {
    ctx,
    publicServer,
    adminServer,
    onClose(fn: () => void | Promise<void>) {
      stoppers.push(fn);
    },
    start() {
      ctx.stats.start();
      // Stündliche Pflege: Papierkorbfrist, Aufbewahrung der Statistik, abgelaufene Sitzungen
      const housekeeping = () => {
        try {
          const n = ctx.pages.purgeExpired();
          if (n) log.info({ n }, 'Seiten endgültig aus dem Papierkorb gelöscht');
          ctx.stats.purge(ctx.settings.get('statsRetentionDays'));
          ctx.auth.purgeSessions();
        } catch (e) {
          log.error({ err: e }, 'Pflegeaufgabe fehlgeschlagen');
        }
      };
      housekeeping();
      const t = setInterval(housekeeping, 3600_000);
      t.unref();
      stoppers.push(() => clearInterval(t));
      // Automatische Sicherung
      if (config.backup.intervalHours > 0) {
        const backup = () => {
          try {
            ctx.backups.create('auto');
            ctx.backups.prune(config.backup.keep);
          } catch (e) {
            log.error({ err: e }, 'Automatische Sicherung fehlgeschlagen');
          }
        };
        const last = ctx.backups.list().find((b) => b.label === 'auto');
        if (!last || Date.now() - new Date(last.createdAt).getTime() > config.backup.intervalHours * 3600_000) backup();
        const bt = setInterval(backup, config.backup.intervalHours * 3600_000);
        bt.unref();
        stoppers.push(() => clearInterval(bt));
      }
    },
    async close() {
      for (const s of stoppers) await s();
      ctx.stats.stop();
      await Promise.allSettled([publicServer.close(), adminServer.close()]);
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        /* bereits geschlossen */
      }
      db.close();
    },
  };
}
