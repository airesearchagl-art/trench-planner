import { test, expect } from '@playwright/test';

test('使い方を別タブで参照しても入力を保持し、目次・画像・戻り先を利用できる', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('施工余裕', { exact: true }).fill('10');
  // 欄の確定とリンクのクリックを1回の操作で行うケース。
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: '使い方（別タブで開く）' }).click();
  const guide = await popup;
  await expect(guide).toHaveURL(/\/manual\.html$/);
  await expect(guide.getByRole('heading', { level: 1 })).toContainText('断面で確かめる');
  await expect(page.getByTestId('common-slab')).toHaveText('350mm');
  await expect(page.getByLabel('施工余裕', { exact: true })).toHaveValue('10');
  for (const link of await guide.locator('.contents a').all()) {
    const href = await link.getAttribute('href');
    await link.click();
    await expect(guide.locator(href!)).toBeInViewport();
  }
  for (const img of await guide.locator('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  await guide.goto('/manual.html');
  await guide.setViewportSize({ width: 1440, height: 1080 });
  await guide.screenshot({ path: info.outputPath('manual-desktop.png') });
  for (const width of [390, 320]) {
    await guide.setViewportSize({ width, height: 844 });
    expect(await guide.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await guide.setViewportSize({ width: 390, height: 844 });
  await guide.screenshot({ path: info.outputPath('manual-mobile.png') });
  await guide.getByRole('link', { name: 'アプリを開く ↗', exact: true }).click();
  await expect(guide.getByLabel('施工余裕', { exact: true })).toHaveValue('10');
  await expect(guide.getByTestId('common-slab')).toHaveText('350mm');
});
