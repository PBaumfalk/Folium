/**
 * Kommandozeile im Container:  docker compose exec folium folium <befehl>
 *   health                  Prüft beide Dienste (für den Docker-Healthcheck)
 *   version                 Zeigt die Version
 *   passwort <e-mail>       Setzt ein neues zufälliges Passwort und gibt es einmalig aus
 *   konten                  Listet alle Konten
 *   sicherung               Legt sofort eine Sicherung an
 */
import { createApp } from './app.js';
import { loadConfig, VERSION } from './config.js';
import { randomToken } from './lib/crypto.js';
import { createLogger } from './lib/log.js';

const [cmd, ...args] = process.argv.slice(2);
const config = loadConfig();

async function health() {
  const ok = async (port: number) => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch {
      return false;
    }
  };
  const [pub, adm] = await Promise.all([ok(config.publicPort), ok(config.adminPort)]);
  console.log(`öffentlich: ${pub ? 'ok' : 'FEHLER'}, Verwaltung: ${adm ? 'ok' : 'FEHLER'}`);
  process.exit(pub && adm ? 0 : 1);
}

async function withApp<T>(fn: (app: Awaited<ReturnType<typeof createApp>>) => Promise<T>) {
  const app = await createApp(config, createLogger('warn'));
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

switch (cmd) {
  case 'health':
    await health();
    break;
  case 'version':
    console.log(`Folium ${VERSION}`);
    break;
  case 'konten':
    await withApp(async ({ ctx }) => {
      for (const u of ctx.auth.listUsers()) console.log(`${u.id}\t${u.role}\t${u.disabled ? 'gesperrt' : 'aktiv'}\t${u.email}`);
    });
    break;
  case 'passwort': {
    const email = args[0];
    if (!email) {
      console.error('Aufruf: folium passwort <e-mail>');
      process.exit(2);
    }
    await withApp(async ({ ctx }) => {
      const u = ctx.auth.byEmail(email);
      if (!u) {
        console.error(`Kein Konto mit ${email}.`);
        process.exit(1);
      }
      const pw = randomToken(15);
      await ctx.auth.setPassword(u.id, pw);
      ctx.audit.log(null, 'user.password_reset_cli', 'user', u.id);
      console.log(`Neues Passwort für ${email}: ${pw}\nBitte nach der Anmeldung ändern. Alle Sitzungen dieses Kontos wurden beendet.`);
    });
    break;
  }
  case 'sicherung':
    await withApp(async ({ ctx }) => {
      const b = ctx.backups as { create(label: string): { file: string } } | undefined;
      if (!b) throw new Error('Sicherungen sind nicht verfügbar.');
      console.log(`Sicherung angelegt: ${b.create('manuell').file}`);
    });
    break;
  default:
    console.log('Befehle: health | version | konten | passwort <e-mail> | sicherung');
    process.exit(cmd ? 2 : 0);
}
