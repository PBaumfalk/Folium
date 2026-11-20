import { expect, test } from '@playwright/test';
import { login, newPage, publish, PUB, saved } from './helpers.js';

test('anlegen, bearbeiten, sortieren, veröffentlichen, Entwurf privat, wiederherstellen', async ({ page, request }) => {
  await login(page);
  await newPage(page, 'Infoabend Herbst');
  await page.locator('.addmenu button', { hasText: 'Link' }).click();
  await page.getByLabel('Titel').fill('Infoabend Arbeitsrecht');
  await page.getByLabel('Ziel').fill('https://www.example.com/arbeitsrecht-rechtsanwalt/');
  await saved(page);
  // Tastatur-Alternative zum Ziehen: Knopf „Nach oben“
  await page.getByRole('button', { name: 'Nach oben: Infoabend Arbeitsrecht' }).click();
  await saved(page);
  // Vorschau Smartphone/Desktop
  await page.getByRole('button', { name: 'Desktop' }).click();
  await expect(page.frameLocator('iframe[title="Vorschau Desktop"]').getByText('Infoabend Arbeitsrecht')).toBeVisible();
  await page.getByRole('button', { name: 'Smartphone' }).click();
  await publish(page);
  const v1 = await (await request.get(`${PUB}/infoabend-herbst`)).text();
  expect(v1).toContain('Infoabend Arbeitsrecht');

  // Entwurf ändern: öffentlich unverändert
  await page.getByLabel('Name', { exact: true }).fill('ENTWURF NEU');
  await saved(page);
  expect(await (await request.get(`${PUB}/infoabend-herbst`)).text()).not.toContain('ENTWURF NEU');
  await publish(page);
  expect(await (await request.get(`${PUB}/infoabend-herbst`)).text()).toContain('ENTWURF NEU');

  // Version 1 wiederherstellen
  await page.getByRole('tab', { name: 'Versionen' }).click();
  await page.locator('tr', { hasText: /^1/ }).getByRole('button', { name: 'Wiederherstellen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.locator('.toast', { hasText: 'wieder öffentlich' })).toBeVisible();
  expect(await (await request.get(`${PUB}/infoabend-herbst`)).text()).not.toContain('ENTWURF NEU');
});

test('Block löschen lässt sich rückgängig machen; Papierkorb', async ({ page, request }) => {
  await login(page);
  await page.getByRole('link', { name: 'Café Lindenblatt' }).click();
  await expect(page.locator('.blk').first()).toBeVisible();
  const n = await page.locator('.blk').count();
  await page.getByRole('button', { name: /^Löschen: / }).first().click();
  await expect(page.locator('.blk')).toHaveCount(n - 1);
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('.blk')).toHaveCount(n);
  await saved(page);
  // Duplizieren und Papierkorb
  await page.goto('/');
  await page.locator('.pcard', { hasText: 'Tischlerei Holm' }).getByRole('button', { name: 'Duplizieren' }).click();
  await expect(page.getByRole('heading', { name: 'Tischlerei Holm (Kopie)' })).toBeVisible();
  await page.getByRole('tab', { name: 'Seite' }).click();
  await page.getByRole('button', { name: 'In den Papierkorb' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'In den Papierkorb' }).click();
  await page.getByRole('link', { name: 'Papierkorb' }).click();
  await page.locator('tr', { hasText: 'Kopie' }).getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.locator('.toast', { hasText: 'wiederhergestellt' })).toBeVisible();
  expect((await request.get(`${PUB}/tischlerei`)).status()).toBe(200);
});

test('gleichzeitige Bearbeitung in zwei Tabs meldet Konflikt', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await login(a);
  await a.getByRole('link', { name: 'Studio Wellenform' }).click();
  const b = await ctx.newPage();
  await b.goto(a.url());
  await b.getByLabel('Kurzbeschreibung').fill('Fassung B');
  await saved(b);
  await a.getByLabel('Kurzbeschreibung').fill('Fassung A');
  await expect(a.getByRole('dialog', { name: 'Seite wurde an anderer Stelle geändert' })).toBeVisible({ timeout: 10_000 });
  await a.getByRole('button', { name: 'Meine Fassung behalten' }).click();
  await saved(a);
  await ctx.close();
});

test('Ansehen-Rolle kann nichts verändern', async ({ page }) => {
  await login(page, 'ansicht@example.test');
  await expect(page.getByRole('button', { name: 'Neue Seite' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Café Lindenblatt' }).click();
  await expect(page.getByRole('button', { name: 'Veröffentlichen' })).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
});

test('neuer Link ohne Ziel wird gespeichert, Veröffentlichen nennt den fehlenden Eintrag', async ({ page }) => {
  await login(page);
  await newPage(page, 'Unfertig', 'Editorial', 'Leer');
  await page.locator('.addmenu button', { hasText: 'Link' }).click();
  await page.getByLabel('Titel').fill('Noch ohne Ziel');
  await saved(page);
  await expect(page.getByText('Noch kein Ziel')).toBeVisible();
});

test('Fehler aus der Anmeldung über OIDC wird auf der Anmeldeseite angezeigt', async ({ page }) => {
  await page.goto('/?fehler=Ihr%20Konto%20ist%20f%C3%BCr%20Folium%20nicht%20freigeschaltet.');
  await expect(page.getByRole('alert')).toContainText('nicht freigeschaltet');
  await expect(page).toHaveURL(/\/$/);
});
