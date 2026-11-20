import path from 'node:path';

export const VERSION = process.env.FOLIUM_BUILD_VERSION ?? '0.1.1-dev';

export interface Config {
  version: string;
  dataDir: string;
  dbPath: string;
  backupDir: string;
  assetDir: string;
  host: string;
  publicPort: number;
  adminPort: number;
  /** Adresse der Verwaltungsoberfläche (für Origin-Prüfung, OIDC) */
  appUrl: string;
  /** Basisadresse der öffentlichen Seiten, z. B. https://links.example.com */
  publicBaseUrl: string;
  trustProxy: boolean | string;
  setupCode: string;
  logLevel: string;
  timezone: string;
  secureCookies: boolean;
  ai: {
    provider: 'anthropic' | 'fake' | 'none';
    apiKey: string;
    model: string;
    dailyLimit: number;
    hourlyPerUser: number;
    monthlyBudgetEur: number;
    timeoutMs: number;
  };
  /** WebSocket des Playwright-Servers im abgeschotteten Browser-Container */
  browserWsUrl: string;
  /** Nur für Tests/Intranet: Analyse darf private Ziele abrufen */
  analysisAllowPrivate: boolean;
  /** Ausnahmen für Tests/Intranet (Hostnamen, IPs oder Netze) */
  analysisAllowHosts: string[];
  filum: { url: string; token: string };
  tessera: { url: string; token: string };
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    adminGroups: string[];
    editorGroups: string[];
    defaultRole: 'viewer' | 'editor' | 'admin' | 'none';
    buttonLabel: string;
  } | null;
  disableLocalLogin: boolean;
  backup: { intervalHours: number; keep: number };
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? Math.floor(n) : d;
};
/** Zahl mit Nachkommastellen; 0 ist ein gültiger Wert. */
const num = (v: string | undefined, d: number) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
const bool = (v: string | undefined, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'ja', 'on'].includes(v.toLowerCase()));
const trimSlash = (s: string) => s.replace(/\/+$/, '');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  const appUrl = trimSlash(env.APP_URL ?? `http://localhost:${env.ADMIN_PORT ?? 8081}`);
  const publicBaseUrl = trimSlash(env.PUBLIC_BASE_URL ?? `http://localhost:${env.PUBLIC_PORT ?? 8080}`);
  const providerRaw = (env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'none')).toLowerCase();
  const provider = (['anthropic', 'fake', 'none'].includes(providerRaw) ? providerRaw : 'none') as Config['ai']['provider'];
  const tp = env.TRUST_PROXY;
  return {
    version: VERSION,
    dataDir,
    dbPath: path.join(dataDir, 'folium.db'),
    backupDir: path.join(dataDir, 'backups'),
    assetDir: path.join(dataDir, 'assets'),
    host: env.HOST ?? '0.0.0.0',
    publicPort: int(env.PUBLIC_PORT, 8080),
    adminPort: int(env.ADMIN_PORT, 8081),
    appUrl,
    publicBaseUrl,
    trustProxy: tp === undefined || tp === '' ? false : tp === 'true' ? true : tp === 'false' ? false : tp,
    setupCode: env.SETUP_CODE ?? '',
    logLevel: env.LOG_LEVEL ?? 'info',
    timezone: env.APP_TIMEZONE ?? 'Europe/Berlin',
    secureCookies: bool(env.SECURE_COOKIES, appUrl.startsWith('https://')),
    ai: {
      provider,
      apiKey: env.ANTHROPIC_API_KEY ?? '',
      model: env.AI_MODEL || 'claude-opus-5-5',
      dailyLimit: int(env.AI_DAILY_LIMIT, 30),
      hourlyPerUser: int(env.AI_HOURLY_PER_USER, 10),
      monthlyBudgetEur: num(env.AI_MONTHLY_BUDGET_EUR, 20),
      timeoutMs: int(env.AI_TIMEOUT_MS, 120_000),
    },
    browserWsUrl: env.BROWSER_WS_URL ?? '',
    analysisAllowPrivate: bool(env.ANALYSIS_ALLOW_PRIVATE),
    analysisAllowHosts: list(env.ANALYSIS_ALLOW_HOSTS),
    filum: { url: trimSlash(env.FILUM_URL ?? ''), token: env.FILUM_TOKEN ?? '' },
    tessera: { url: trimSlash(env.TESSERA_URL ?? ''), token: env.TESSERA_TOKEN ?? '' },
    oidc: env.OIDC_ISSUER
      ? {
          issuer: env.OIDC_ISSUER,
          clientId: env.OIDC_CLIENT_ID ?? '',
          clientSecret: env.OIDC_CLIENT_SECRET ?? '',
          adminGroups: list(env.OIDC_ADMIN_GROUPS),
          editorGroups: list(env.OIDC_EDITOR_GROUPS),
          defaultRole: (['viewer', 'editor', 'admin', 'none'].includes(env.OIDC_DEFAULT_ROLE ?? '') ? env.OIDC_DEFAULT_ROLE : 'viewer') as 'viewer',
          buttonLabel: env.OIDC_BUTTON_LABEL ?? 'Mit authentik anmelden',
        }
      : null,
    disableLocalLogin: bool(env.DISABLE_LOCAL_LOGIN),
    backup: { intervalHours: int(env.BACKUP_INTERVAL_HOURS, 24), keep: int(env.BACKUP_KEEP, 14) },
  };
}
