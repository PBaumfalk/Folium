import { expect, test } from '@playwright/test';
import { login, publish, PUB, saved } from './helpers.js';

test('manuelles Design ohne KI wirkt erst nach dem Veröffentlichen', async ({ page, request }) => {
  await login(page);
  await page.getByRole('link', { name: 'Muster & Partner (Editorial)' }).click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByLabel('Akzent (Hauptaktion)', { exact: true }).fill('#7A1F2B');
  await page.getByRole('radio', { name: 'Pille', exact: true }).click();
  await saved(page);
  await expect.poll(async () => (await page.frameLocator('iframe[title^="Vorschau"]').locator('style').first().textContent()) ?? '').toContain('--accent:#7A1F2B');
  expect(await (await request.get(`${PUB}/muster`)).text()).not.toContain('#7A1F2B');
  await publish(page);
  expect(await (await request.get(`${PUB}/muster`)).text()).toContain('--accent:#7A1F2B');
});

test('Analyse blockiert interne Ziele mit verständlichem Grund', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Muster & Partner (Editorial)' }).click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Design aus Homepage übernehmen' }).click();
  await page.getByLabel('Adresse der Homepage').fill('http://169.254.169.254/latest/meta-data/');
  await page.getByRole('button', { name: 'Homepage untersuchen' }).click();
  await expect(page.getByRole('alert')).toContainText('geschütztes Netz');
});

test('Design aus Homepage (simulierte KI): Varianten übernehmen ändert nur den Entwurf', async ({ page, request }) => {
  await login(page);
  await page.getByRole('link', { name: 'Muster & Partner (Boutique)' }).click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Design aus Homepage übernehmen' }).click();
  await page.getByLabel('Adresse der Homepage').fill(`${PUB}/signature`);
  await page.getByRole('button', { name: 'Homepage untersuchen' }).click();
  await expect(page.getByText('Bitte prüfen, was übertragen wird')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Simulierte KI-Antwort')).toBeVisible();
  await page.getByRole('button', { name: 'An Testanbieter senden' }).click();
  await expect(page.getByText('Visuelle Identität')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Variante übernehmen' })).toHaveCount(3);
  const before = await (await request.get(`${PUB}/boutique`)).text();
  await page.getByRole('button', { name: 'Variante übernehmen' }).nth(1).click();
  await expect(page.locator('.toast', { hasText: 'Öffentlich wird es erst' })).toBeVisible();
  expect(await (await request.get(`${PUB}/boutique`)).text()).toBe(before);
  await page.getByText('Frühere Entwurfsdesigns').click();
  await page.getByRole('button', { name: 'Zurückholen' }).first().click();
  await saved(page);
});
