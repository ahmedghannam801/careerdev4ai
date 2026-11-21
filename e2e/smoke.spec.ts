import { expect, test } from '@playwright/test';

test('production build loads the public Aionvia landing page', async ({ page }) => {
  const response = await page.goto('/');

  expect(response, 'the page should return an HTTP response').not.toBeNull();
  expect(response?.ok(), 'the landing page should load successfully').toBe(true);
  await expect(page).toHaveTitle(/Aionvia/);
  await expect(
    page.getByRole('heading', { name: /Turn Your Ambition Into a Career Plan/i })
  ).toBeVisible({ timeout: 30_000 });
});
