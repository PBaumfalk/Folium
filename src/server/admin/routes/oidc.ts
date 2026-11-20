// Angelehnt an Filum src/server/admin/routes/auth.ts (OIDC-Teil). Nur aktiv, wenn OIDC_ISSUER gesetzt ist.
import type { FastifyInstance } from 'fastify';
import * as oidc from 'openid-client';
import type { Ctx } from '../../context.js';
import { randomToken } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { SESSION_COOKIE, SESSION_DAYS, type Role } from '../../services/auth.js';

const OIDC_COOKIE = 'folium_oidc';

export function registerOidcRoutes(app: FastifyInstance, ctx: Ctx) {
  const o = ctx.config.oidc;
  if (!o) return;
  const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: ctx.config.secureCookies };
  let configPromise: Promise<oidc.Configuration> | null = null;
  const getConfig = () => {
    configPromise ??= oidc.discovery(new URL(o.issuer), o.clientId, o.clientSecret || undefined).catch((e) => {
      configPromise = null;
      throw new AppError(502, 'oidc_discovery', `Der Anmeldedienst (${o.issuer}) ist nicht erreichbar: ${(e as Error).message}`);
    });
    return configPromise;
  };
  const pending = new Map<string, { verifier: string; state: string; nonce: string; at: number }>();
  const redirectUri = `${ctx.config.appUrl}/api/v1/auth/oidc/callback`;

  app.get('/api/v1/auth/oidc/start', async (_req, reply) => {
    const config = await getConfig();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const id = randomToken(18);
    for (const [k, v] of pending) if (Date.now() - v.at > 600_000) pending.delete(k);
    pending.set(id, { verifier, state, nonce, at: Date.now() });
    const url = oidc.buildAuthorizationUrl(config, { redirect_uri: redirectUri, scope: 'openid email profile groups', code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce });
    reply.setCookie(OIDC_COOKIE, id, { ...cookieOpts, maxAge: 600 });
    return reply.redirect(url.href, 302);
  });

  app.get('/api/v1/auth/oidc/callback', async (req, reply) => {
    const id = req.cookies[OIDC_COOKIE];
    const entry = id ? pending.get(id) : undefined;
    reply.clearCookie(OIDC_COOKIE, cookieOpts);
    if (!entry) return reply.redirect('/?fehler=sitzung', 302);
    pending.delete(id!);
    try {
      const config = await getConfig();
      const tokens = await oidc.authorizationCodeGrant(config, new URL(req.url, ctx.config.appUrl), { pkceCodeVerifier: entry.verifier, expectedState: entry.state, expectedNonce: entry.nonce });
      const claims = tokens.claims();
      if (!claims) throw new Error('Keine ID-Token-Angaben erhalten.');
      let info: Record<string, unknown> = { ...claims };
      try {
        info = { ...info, ...(await oidc.fetchUserInfo(config, tokens.access_token, claims.sub)) };
      } catch {
        /* optional */
      }
      const raw = info.groups;
      const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
      const groupRole: Role | null = groups.some((g) => o.adminGroups.includes(g)) ? 'admin' : groups.some((g) => o.editorGroups.includes(g)) ? 'editor' : null;
      const role: Role | null = groupRole ?? (o.defaultRole === 'none' ? null : o.defaultRole);
      if (!role) throw new AppError(403, 'no_role', 'Ihr Konto ist für Folium nicht freigeschaltet.');
      const email = typeof info.email === 'string' ? info.email : `${claims.sub}@oidc.invalid`;
      const verified = info.email_verified === true || info.email_verified === 'true';
      const user = await ctx.auth.upsertOidcUser(String(claims.iss), claims.sub, email, String(info.name ?? info.preferred_username ?? email), role, verified, groupRole !== null);
      reply.setCookie(SESSION_COOKIE, ctx.auth.createSession(user.id), { path: '/', httpOnly: true, sameSite: 'strict', secure: ctx.config.secureCookies, maxAge: SESSION_DAYS * 86400 });
      ctx.audit.log({ userId: user.id, role: user.role, label: user.email }, 'login.oidc', 'user', user.id, { groups: groups.slice(0, 20) });
      return reply.redirect('/', 302);
    } catch (e) {
      ctx.log.warn({ err: e }, 'OIDC-Anmeldung fehlgeschlagen');
      return reply.redirect(`/?fehler=${encodeURIComponent(e instanceof AppError ? e.message : 'Die Anmeldung über authentik ist fehlgeschlagen.')}`, 302);
    }
  });
}
