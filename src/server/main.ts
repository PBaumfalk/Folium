import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './lib/log.js';

const config = loadConfig();
const log = createLogger(config.logLevel);

const app = await createApp(config, log).catch((e: Error) => {
  log.fatal(e.message);
  process.exit(1);
});

await app.publicServer.listen({ port: config.publicPort, host: config.host });
await app.adminServer.listen({ port: config.adminPort, host: config.host });
app.start();
log.info({ public: config.publicPort, admin: config.adminPort, version: config.version }, 'Folium gestartet');

let closing = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    log.info('Folium wird beendet …');
    await app.close();
    process.exit(0);
  });
}
