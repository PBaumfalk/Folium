import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/log.js';
import { hasRole, type Principal, type Role } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

/** Verlangt eine Anmeldung mit mindestens der angegebenen Rolle. */
export function need(req: FastifyRequest, role: Role = 'viewer'): Principal {
  const p = req.principal;
  if (!p) throw new AppError(401, 'unauthenticated', 'Bitte melden Sie sich an.');
  if (!hasRole(p.role, role)) throw new AppError(403, 'forbidden', 'Dafür fehlt Ihnen die Berechtigung.');
  return p;
}

const FIELD_NAMES: Record<string, string> = {};

/** Validiert Eingaben und übersetzt zod-Fehler in eine verständliche 422-Antwort. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw zodToAppError(r.error);
}

export function zodToAppError(e: ZodError): AppError {
  const issue = e.issues[0];
  const field = issue?.path.join('.') || undefined;
  const msg = issue?.message && !/^(Invalid|Expected|Too)/.test(issue.message) ? issue.message : `Ungültige Eingabe${field ? ` im Feld „${FIELD_NAMES[field] ?? field}“` : ''}.`;
  return new AppError(422, 'invalid', msg, field, e.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })));
}

/** Fehlerbehandlung der Verwaltung. Unerwartete Fehler gehen ins Anwendungsprotokoll (Fastify selbst protokolliert nicht). */
export const makeErrorHandler = (log: Pick<Logger, 'error'>) => (err: Error & { statusCode?: number; code?: string; validation?: unknown }, req: FastifyRequest, reply: FastifyReply) => {
  if (err instanceof ZodError) err = zodToAppError(err);
  if (err instanceof AppError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message, field: err.field, details: err.details } });
  }
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
  if (status === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Zu viele Anfragen. Bitte kurz warten.' } });
  if (status === 413) return reply.status(413).send({ error: { code: 'too_large', message: 'Die Datei oder Anfrage ist zu groß.' } });
  if (status < 500) return reply.status(status).send({ error: { code: err.code ?? 'bad_request', message: 'Die Anfrage ist ungültig.' } });
  log.error({ err, method: req.method, url: req.url }, 'Unerwarteter Fehler');
  return reply.status(500).send({ error: { code: 'internal', message: 'Ein unerwarteter Fehler ist aufgetreten. Details stehen im Serverprotokoll.' } });
};
