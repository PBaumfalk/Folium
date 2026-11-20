import { z } from 'zod';
import type { DB } from '../db/db.js';

const urlOrEmpty = z.union([z.literal(''), z.string().url().max(500).refine((u) => /^https?:\/\//.test(u), 'Nur http- oder https-Adressen.')]);

export const settingsSchema = z
  .object({
    imprintUrl: urlOrEmpty,
    privacyUrl: urlOrEmpty,
    homepageUrl: urlOrEmpty,
    defaultPreset: z.enum(['editorial', 'boutique', 'signature']),
    statsEnabled: z.boolean(),
    statsRetentionDays: z.number().int().min(30).max(3650),
    trashDays: z.number().int().min(1).max(365),
  })
  .strict();

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  imprintUrl: '',
  privacyUrl: '',
  homepageUrl: '',
  defaultPreset: 'editorial',
  statsEnabled: true,
  statsRetentionDays: 730,
  trashDays: 30,
};

export class SettingsStore {
  private cache: Settings | null = null;
  constructor(private db: DB) {}

  all(): Settings {
    if (this.cache) return this.cache;
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = JSON.parse(r.value);
    this.cache = s as Settings;
    return this.cache;
  }

  get<K extends keyof Settings>(k: K): Settings[K] {
    return this.all()[k];
  }

  update(patch: Partial<Settings>): Settings {
    const next = settingsSchema.parse({ ...this.all(), ...patch });
    const up = this.db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)');
    this.db.transaction(() => {
      for (const k of Object.keys(patch)) up.run(k, JSON.stringify((next as Record<string, unknown>)[k]));
    })();
    this.cache = null;
    return this.all();
  }
}
