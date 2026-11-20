import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

for (const path of ['/', '/seiten/1', '/seiten/1/design', '/seiten/1/versionen', '/seiten/1/teilen', '/statistik', '/einstellungen', '/papierkorb']) {
  test(`Verwaltung ${path} ohne axe-Verstöße`, async ({ page }) => {
    await login(page, 'admin@example.test');
    await page.goto(path);
    await page.waitForTimeout(1200);
    const r = await new AxeBuilder({ page }).exclude('iframe').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}
