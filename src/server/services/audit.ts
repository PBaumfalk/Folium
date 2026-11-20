import type { DB } from '../db/db.js';
import { now } from '../lib/time.js';
import type { Principal } from './auth.js';

export class Audit {
  constructor(private db: DB) {}

  log(p: Principal | null, action: string, targetType = '', targetId: string | number = '', details: Record<string, unknown> = {}): void {
    this.db
      .prepare('INSERT INTO audit_log(at, user_id, user_label, action, target_type, target_id, details) VALUES (?,?,?,?,?,?,?)')
      .run(now(), p?.userId ?? null, p?.label ?? 'System', action, targetType, String(targetId), JSON.stringify(details));
  }

  list(limit = 200, before?: number) {
    return (
      this.db
        .prepare('SELECT * FROM audit_log WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?')
        .all(before ?? null, before ?? null, Math.min(limit, 500)) as { id: number; at: number; user_label: string; action: string; target_type: string; target_id: string; details: string }[]
    ).map((r) => ({ ...r, at: new Date(r.at * 1000).toISOString(), details: JSON.parse(r.details) }));
  }
}
