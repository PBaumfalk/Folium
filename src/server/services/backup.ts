import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import { AppError } from '../lib/errors.js';

/**
 * Sicherungen: Datenbank (VACUUM INTO, konsistent im laufenden Betrieb) plus hochgeladene Dateien.
 * Wiederherstellen wird vorgemerkt und beim nächsten Start angewendet; der vorherige Stand wird dabei gesichert.
 */
const NAME = /^folium-\d{8}-\d{6}-[a-z-]{1,20}$/;
const pending = (c: Config) => path.join(c.dataDir, 'wiederherstellen.json');

export class Backups {
  constructor(
    private db: DB,
    private config: Config,
  ) {
    fs.mkdirSync(config.backupDir, { recursive: true });
  }

  create(label = 'auto'): { name: string; file: string } {
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `folium-${ts}-${label.replace(/[^a-z-]/g, '').slice(0, 20) || 'auto'}`;
    const dir = path.join(this.config.backupDir, name);
    fs.mkdirSync(dir, { recursive: true });
    this.db.exec(`VACUUM INTO '${path.join(dir, 'folium.db').replace(/'/g, "''")}'`);
    if (fs.existsSync(this.config.assetDir)) fs.cpSync(this.config.assetDir, path.join(dir, 'assets'), { recursive: true });
    return { name, file: dir };
  }

  list() {
    if (!fs.existsSync(this.config.backupDir)) return [];
    return fs
      .readdirSync(this.config.backupDir)
      .filter((n) => NAME.test(n) && fs.existsSync(path.join(this.config.backupDir, n, 'folium.db')))
      .sort()
      .reverse()
      .map((name) => {
        const st = fs.statSync(path.join(this.config.backupDir, name, 'folium.db'));
        return { name, createdAt: st.mtime.toISOString(), bytes: st.size, label: name.split('-').slice(3).join('-') };
      });
  }

  prune(keep: number) {
    const auto = this.list().filter((b) => b.label === 'auto');
    for (const b of auto.slice(keep)) fs.rmSync(path.join(this.config.backupDir, b.name), { recursive: true, force: true });
  }

  stageRestore(name: string) {
    if (!NAME.test(name) || !fs.existsSync(path.join(this.config.backupDir, name, 'folium.db'))) throw new AppError(404, 'not_found', 'Sicherung nicht gefunden.');
    fs.writeFileSync(pending(this.config), JSON.stringify({ name, at: new Date().toISOString() }));
  }
}

/** Beim Start: vorgemerkte Wiederherstellung anwenden. */
export function applyStagedRestore(config: Config): { restored: boolean; previous?: string } {
  const p = pending(config);
  if (!fs.existsSync(p)) return { restored: false };
  const { name } = JSON.parse(fs.readFileSync(p, 'utf8')) as { name: string };
  const src = path.join(config.backupDir, name);
  if (!NAME.test(name) || !fs.existsSync(path.join(src, 'folium.db'))) {
    fs.rmSync(p);
    return { restored: false };
  }
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const prev = path.join(config.backupDir, `folium-${ts}-vor-wiederherst`);
  fs.mkdirSync(prev, { recursive: true });
  for (const ext of ['', '-wal', '-shm']) {
    const f = config.dbPath + ext;
    if (fs.existsSync(f)) fs.renameSync(f, path.join(prev, path.basename(f)));
  }
  if (fs.existsSync(config.assetDir)) fs.renameSync(config.assetDir, path.join(prev, 'assets'));
  fs.copyFileSync(path.join(src, 'folium.db'), config.dbPath);
  if (fs.existsSync(path.join(src, 'assets'))) fs.cpSync(path.join(src, 'assets'), config.assetDir, { recursive: true });
  fs.rmSync(p);
  return { restored: true, previous: prev };
}
