import { defineConfig, devices } from '@playwright/test';

// Startet eine frische Folium-Instanz mit Beispieldaten und simulierter KI (AI_PROVIDER=fake).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:18281', trace: 'retain-on-failure', locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  webServer: {
    command: 'rm -rf data-e2e && npx tsx scripts/demo.ts data-e2e',
    url: 'http://localhost:18281/healthz',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PUBLIC_PORT: '18280', ADMIN_PORT: '18281', APP_URL: 'http://localhost:18281', PUBLIC_BASE_URL: 'http://localhost:18280', AI_PROVIDER: 'fake', ANALYSIS_ALLOW_HOSTS: 'localhost,127.0.0.1,::1', BROWSER_WS_URL: '', BACKUP_INTERVAL_HOURS: '0' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'smartphone', use: { ...devices['Pixel 7'] }, testMatch: /(public|mobile)\.spec\.ts/ },
  ],
});
