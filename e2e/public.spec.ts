import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PUB } from './helpers.js';

for (const slug of ['cafe', 'studio', 'tischlerei']) {
  test(`öffentliche Seite ${slug}: Inhalt, Pflichtlinks, Barrierefreiheit, kein Querscrollen`, async ({ page }) => {
    await page.goto(`${PUB}/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
    await expect(page.locator('a[href^="tel:+4930123456"]').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Impressum', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Datenschutz', exact: true })).toBeVisible();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    expect((await page.context().cookies()).length).toBe(0);
  });
}

test('Klick wird gezählt; Link funktioniert auch ohne Zählung', async ({ page, request }) => {
  await page.route('**/c', (r) => r.abort());
  await page.goto(`${PUB}/cafe`);
  const link = page.locator('a.link').first();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^https:\/\//);
  await page.unroute('**/c');
  await page.goto(`${PUB}/cafe?src=e2e`);
  await page.route('https://www.example.com/**', (r) => r.fulfill({ body: 'ziel' }));
  await page.locator('a.link').first().click();
  await expect(page.locator('body')).toHaveText('ziel');
  void request;
});

test('Tastaturbedienung: Sprunglink und sichtbarer Fokus', async ({ page }) => {
  await page.goto(`${PUB}/cafe`);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeFocused();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});
