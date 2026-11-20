import { expect, type Page } from '@playwright/test';
export const PUB = 'http://localhost:18280';
export async function login(page: Page, email = 'redaktion@example.test') {
  await page.goto('/');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort').fill('demo-passwort-123');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Linkseiten' })).toBeVisible();
}
export async function newPage(page: Page, name: string, preset = 'Editorial', template = 'Organisation') {
  await page.getByRole('button', { name: 'Neue Seite' }).first().click();
  await page.getByLabel('Name (nur intern)').fill(name);
  await page.locator('label.card', { hasText: template }).first().click();
  await page.locator('label.card', { hasText: preset }).click();
  await page.getByRole('button', { name: 'Seite anlegen' }).click();
  await expect(page).toHaveURL(/\/seiten\/\d+/);
}
export async function saved(page: Page) {
  await expect(page.locator('.save')).toContainText('Gespeichert', { timeout: 10_000 });
}
export async function publish(page: Page) {
  await saved(page);
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await page.getByRole('button', { name: 'Jetzt veröffentlichen' }).click();
  await expect(page.locator('.toast', { hasText: 'Veröffentlicht als Version' }).last()).toBeVisible();
}
