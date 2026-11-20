import { expect, test } from '@playwright/test';
import { PUB } from './helpers.js';

for (const width of [320, 375, 390]) {
  test(`kein horizontales Scrollen bei ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const slug of ['muster', 'boutique', 'signature']) {
      await page.goto(`${PUB}/${slug}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, slug).toBeLessThanOrEqual(0);
    }
  });
}
