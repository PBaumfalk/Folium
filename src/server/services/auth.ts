// Angelehnt an Filum src/server/services/auth.ts, auf drei Rollen und Sitzungen reduziert.
import type { DB } from '../db/db.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { now } from '../lib/time.js';

export const SESSION_COOKIE = 'folium_session';
export const SESSION_DAYS = 14;
export type Role = 'admin' | 'editor' | 'viewer';
export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
export const hasRole = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  password_hash: string | null;
  oidc_issuer: string | null;
  oidc_sub: string | null;
  disabled: number;
  created_at: number;
  last_login_at: number | null;
}

export interface Principal {
  userId: number;
  role: Role;
  label: string;
}

export const serializeUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  disabled: Boolean(u.disabled),
  sso: Boolean(u.oidc_sub),
  createdAt: new Date(u.created_at * 1000).toISOString(),
  lastLoginAt: u.last_login_at ? new Date(u.last_login_at * 1000).toISOString() : null,
});

export function validatePassword(pw: string): void {
  if (typeof pw !== 'string' || pw.length < 12) throw new AppError(422, 'weak_password', 'Das Passwort muss mindestens 12 Zeichen lang sein.', 'password');
  if (pw.length > 200) throw new AppError(422, 'weak_password', 'Das Passwort ist zu lang (höchstens 200 Zeichen).', 'password');
}

/** Begrenzung fehlgeschlagener Anmeldungen je Konto und je Absender (nur im Arbeitsspeicher). */
export class LoginThrottle {
  private fails = new Map<string, { n: number; until: number; first: number }>();
  constructor(
    private max = 5,
    private windowSec = 15 * 60,
    private lockSec = 15 * 60,
  ) {}
  check(key: string): void {
    const f = this.fails.get(key);
    if (f && f.until > now()) {
      throw new AppError(429, 'throttled', `Zu viele fehlgeschlagene Anmeldungen. Bitte in ${Math.ceil((f.until - now()) / 60)} Minuten erneut versuchen.`);
    }
  }
  fail(key: string): void {
    const t = now();
    const f = this.fails.get(key);
    if (!f || t - f.first > this.windowSec) {
      this.fails.set(key, { n: 1, until: 0, first: t });
      return;
    }
    f.n++;
    if (f.n >= this.max) f.until = t + this.lockSec;
  }
  ok(key: string): void {
    this.fails.delete(key);
  }
}

export class Auth {
  readonly throttle = new LoginThrottle();
  constructor(private db: DB) {}

  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }
  getUser(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }
  byEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as UserRow | undefined;
  }
  listUsers(): UserRow[] {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[];
  }

  async createUser(input: { email: string; name: string; role: Role; password?: string; oidc?: { issuer: string; sub: string } }): Promise<UserRow> {
    const email = input.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(422, 'invalid', 'Bitte eine gültige E-Mail-Adresse angeben.', 'email');
    if (this.byEmail(email)) throw new AppError(409, 'conflict', 'Für diese E-Mail-Adresse gibt es schon ein Konto.', 'email');
    let hash: string | null = null;
    if (input.password !== undefined) {
      validatePassword(input.password);
      hash = await hashPassword(input.password);
    }
    const r = this.db
      .prepare('INSERT INTO users(email, name, role, password_hash, oidc_issuer, oidc_sub, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(email, input.name.trim().slice(0, 120), input.role, hash, input.oidc?.issuer ?? null, input.oidc?.sub ?? null, now());
    return this.getUser(Number(r.lastInsertRowid))!;
  }

  /** Konto aus OIDC anlegen oder aktualisieren. Vorhandene lokale Konten nur bei bestätigter E-Mail verknüpfen. */
  async upsertOidcUser(issuer: string, sub: string, email: string, name: string, role: Role, emailVerified: boolean): Promise<UserRow> {
    const bySub = this.db.prepare('SELECT * FROM users WHERE oidc_issuer = ? AND oidc_sub = ?').get(issuer, sub) as UserRow | undefined;
    if (bySub) {
      if (bySub.disabled) throw new AppError(403, 'disabled', 'Dieses Konto ist gesperrt.');
      this.db.prepare('UPDATE users SET role = ?, name = ? WHERE id = ?').run(role, name.slice(0, 120), bySub.id);
      return this.getUser(bySub.id)!;
    }
    const byMail = this.byEmail(email);
    if (byMail) {
      if (!emailVerified || byMail.oidc_sub) throw new AppError(409, 'conflict', 'Für diese E-Mail-Adresse gibt es schon ein lokales Konto. Bitte eine Admin-Person um Verknüpfung bitten.');
      this.db.prepare('UPDATE users SET oidc_issuer = ?, oidc_sub = ?, role = ? WHERE id = ?').run(issuer, sub, role, byMail.id);
      return this.getUser(byMail.id)!;
    }
    return this.createUser({ email, name, role, oidc: { issuer, sub } });
  }

  updateUser(id: number, patch: { role?: Role; name?: string; disabled?: boolean }): UserRow {
    const u = this.getUser(id);
    if (!u) throw new AppError(404, 'not_found', 'Konto nicht gefunden.');
    if ((patch.role && patch.role !== 'admin') || patch.disabled) {
      if (u.role === 'admin' && this.activeAdmins() <= 1) throw new AppError(409, 'last_admin', 'Das letzte aktive Admin-Konto kann nicht herabgestuft oder gesperrt werden.');
    }
    this.db
      .prepare('UPDATE users SET role = COALESCE(?, role), name = COALESCE(?, name), disabled = COALESCE(?, disabled) WHERE id = ?')
      .run(patch.role ?? null, patch.name ?? null, patch.disabled === undefined ? null : Number(patch.disabled), id);
    if (patch.disabled) this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return this.getUser(id)!;
  }

  deleteUser(id: number): void {
    const u = this.getUser(id);
    if (!u) return;
    if (u.role === 'admin' && this.activeAdmins() <= 1) throw new AppError(409, 'last_admin', 'Das letzte Admin-Konto kann nicht gelöscht werden.');
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  async setPassword(id: number, pw: string): Promise<void> {
    validatePassword(pw);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(pw), id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  private activeAdmins(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get() as { n: number }).n;
  }

  async verifyLogin(email: string, password: string): Promise<UserRow | null> {
    const u = this.byEmail(email ?? '');
    const ok = await verifyPassword(password ?? '', u?.password_hash);
    if (!u || !ok || u.disabled) return null;
    return u;
  }

  createSession(userId: number): string {
    const token = randomToken(32);
    const t = now();
    this.db.prepare('INSERT INTO sessions(id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)').run(sha256(token), userId, t, t + SESSION_DAYS * 86400, t);
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(t, userId);
    return token;
  }

  sessionUser(token: string | undefined): UserRow | null {
    if (!token) return null;
    const row = this.db
      .prepare('SELECT u.*, s.expires_at AS s_exp, s.last_seen_at AS s_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?')
      .get(sha256(token)) as (UserRow & { s_exp: number; s_seen: number }) | undefined;
    if (!row || row.s_exp < now() || row.disabled) return null;
    if (now() - row.s_seen > 300) this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(now(), sha256(token));
    return row;
  }

  endSession(token: string | undefined): void {
    if (token) this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(token));
  }

  purgeSessions(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  }
}
