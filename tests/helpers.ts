import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { createLogger } from '../src/server/lib/log.js';
import type { Role } from '../src/server/services/auth.js';

export const SETUP = '111-222-333';
export const ADMIN_ORIGIN = 'http://admin.test';
const open: { close(): Promise<void>; dir: string }[] = [];

afterEach(async () => {
  while (open.length) {
    const a = open.pop()!;
    await a.close();
    fs.rmSync(a.dir, { recursive: true, force: true });
  }
});

export interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: any;
}

export async function makeApp(env: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folium-test-'));
  const config = loadConfig({
    DATA_DIR: dir,
    APP_URL: ADMIN_ORIGIN,
    PUBLIC_BASE_URL: 'http://links.test',
    SETUP_CODE: SETUP,
    AI_PROVIDER: 'none',
    ...env,
  });
  const app = await createApp(config, createLogger('silent'));
  // Pflichtlinks wie in einer eingerichteten Instanz (ohne sie lässt sich nichts veröffentlichen)
  app.ctx.settings.update({ imprintUrl: 'https://www.example.com/impressum/', privacyUrl: 'https://www.example.com/datenschutz/' });
  open.push({ close: () => app.close(), dir });

  const wrap = (r: { statusCode: number; headers: Record<string, any>; body: string }): Res => {
    let json: any;
    try {
      json = JSON.parse(r.body);
    } catch {
      json = undefined;
    }
    return { status: r.statusCode, headers: r.headers, body: r.body, json };
  };

  /** Ein Browser-ähnlicher Client mit eigenem Cookie-Speicher für die Verwaltung. */
  function agent() {
    let cookie = '';
    const call = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
      const isWrite = !['GET', 'HEAD'].includes(method);
      const r = await app.adminServer.inject({
        method: method as any,
        url,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(isWrite ? { origin: ADMIN_ORIGIN } : {}),
          ...(body !== undefined && !(body instanceof Buffer) ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        payload: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body),
      });
      const set = r.headers['set-cookie'];
      const list = Array.isArray(set) ? set : set ? [set] : [];
      for (const c of list) {
        const pair = c.split(';')[0];
        if (pair.startsWith('folium_session=')) cookie = pair.endsWith('=') ? '' : pair;
      }
      return wrap(r);
    };
    return { call, get cookie() { return cookie; } };
  }

  const pub = async (url: string, opts: { host?: string; method?: string; body?: string; headers?: Record<string, string> } = {}) =>
    wrap(
      await app.publicServer.inject({
        method: (opts.method ?? 'GET') as any,
        url,
        headers: { host: opts.host ?? 'links.test', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile', ...(opts.headers ?? {}) },
        payload: opts.body,
      }),
    );

  let n = 0;
  /** Legt (falls nötig) das erste Admin-Konto an und meldet einen Benutzer mit der Rolle an. */
  async function loginAs(role: Role) {
    const a = agent();
    if (app.ctx.auth.userCount() === 0) {
      const s = await a.call('POST', '/api/v1/setup', { code: SETUP, email: 'admin@example.test', name: 'Admin', password: 'sehr-geheimes-passwort' });
      if (s.status !== 200) throw new Error(`setup failed ${s.status} ${s.body}`);
      if (role === 'admin') return a;
    }
    const email = `${role}${++n}@example.test`;
    await app.ctx.auth.createUser({ email, name: role, role, password: 'sehr-geheimes-passwort' });
    const l = await a.call('POST', '/api/v1/login', { email, password: 'sehr-geheimes-passwort' });
    if (l.status !== 200) throw new Error(`login failed ${l.status} ${l.body}`);
    return a;
  }

  return { app, ctx: app.ctx, dir, agent, pub, loginAs };
}
