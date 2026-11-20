import type { PageContent } from '../../shared/content';
import type { Theme } from '../../shared/theme';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, opts: { raw?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Keine Verbindung zum Server. Bitte Netzwerk prüfen und erneut versuchen.');
  }
  if (opts.raw && res.ok) return (await res.text()) as T;
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* kein JSON */
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Fehler ${res.status}`, e?.field, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>('GET', url, undefined, { signal }),
  post: <T>(url: string, body?: unknown, signal?: AbortSignal) => request<T>('POST', url, body ?? {}, { signal }),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  html: (url: string, body?: unknown, signal?: AbortSignal) => request<string>(body === undefined ? 'GET' : 'POST', url, body, { raw: true, signal }),
};

// ── Typen der API ─────────────────────────────────────────────────────

export type Role = 'admin' | 'editor' | 'viewer';
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  sso: boolean;
  lastLoginAt: string | null;
}
export interface Session {
  user: User | null;
  needsSetup: boolean;
  version: string;
  publicBaseUrl: string;
  timezone: string;
  trashDays: number;
  defaultPreset: 'editorial' | 'boutique' | 'signature';
  localLogin: boolean;
  oidc: { label: string } | null;
  integrations: { ai: { provider: string; model: string; simulated: boolean } | null; filum: boolean; tessera: boolean; browser: boolean };
}
export interface PageView {
  id: number;
  slug: string;
  name: string;
  draft: { content: PageContent; theme: Theme; rev: number; updatedAt: string; updatedBy: string };
  published: { versionId: number; number: number; publishedAt: string; publishedBy: string } | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  deletedAt: string | null;
}
export interface Version {
  id: number;
  number: number;
  note: string;
  publishedAt: string;
  publishedBy: string;
  current: boolean;
}
export interface Asset {
  id: string;
  kind: 'image' | 'svg' | 'font';
  width: number | null;
  height: number | null;
  bytes: number;
  label: string;
  createdAt: string;
  url: string;
}

export const can = (u: User | null | undefined, role: Role) => !!u && { viewer: 0, editor: 1, admin: 2 }[u.role] >= { viewer: 0, editor: 1, admin: 2 }[role];
