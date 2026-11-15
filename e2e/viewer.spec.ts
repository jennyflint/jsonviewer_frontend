import { expect, test } from '@playwright/test';
import { mockApi, setEditor } from './helpers';

const DOC =
  '{"users":[{"id":1,"name":"Ann","email":"ann@x.io"},{"id":2,"name":"Bob","email":"bob@x.io"}],"count":2}';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('paste → format → tree → search → select → copy path', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((d) => navigator.clipboard.writeText(d), DOC);
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByText('Valid JSON')).toBeVisible();
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('"users": [');
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await expect(page.getByRole('tree')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search in tree' }).fill('bob@');
  await expect(page.getByTestId('search-count')).toContainText('1 / 1');
  const row = page.getByRole('treeitem').filter({ hasText: 'email' }).filter({ hasText: 'bob@x.io' });
  await expect(row).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.users[1].email');
  await row.click();
  await page.getByRole('button', { name: 'Copy path' }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('$.users[1].email');
});

test('tree keyboard navigation follows the ARIA tree pattern', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, DOC);
  await page.getByRole('tab', { name: 'Viewer' }).click();
  const items = page.getByRole('treeitem');
  await items.first().click();
  await expect(items.first()).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tree').focus();
  await expect(items.first()).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowLeft'); // collapse root
  await expect(items.first()).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(items.nth(1)).toHaveAttribute('aria-level', '2');
});

test('invalid JSON shows the error location and disables formatting', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"a":1,}');
  await expect(page.getByRole('status').getByText(/Trailing comma is not allowed/)).toBeVisible();
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.getByText('Cannot process invalid JSON')).toBeVisible();
});

test('property panel lists children and selecting one selects it in the tree', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, DOC);
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await page.getByRole('treeitem').first().click();
  const rows = page.getByTestId('property-rows').getByRole('row');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'count' }).click();
  await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.count');
});

test('draft survives a reload', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"keep":"me"}');
  await page.waitForTimeout(1300);
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('"keep":"me"');
});

test('theme and language switch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitem', { name: 'Українська' }).click();
  await expect(page.getByRole('button', { name: 'Вставити' })).toBeVisible();
});

test('duplicates panel: click a path → node is selected', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"a":{"x":1,"y":"same"},"b":{"x":2,"y":"same"},"k":1,"k":2}');
  await expect(page.getByText('Valid JSON')).toBeVisible();
  await page.getByRole('button', { name: /Duplicates/ }).click();
  const panel = page.getByRole('complementary', { name: 'Duplicates' });
  await expect(panel.getByText('Duplicate keys')).toBeVisible();
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await panel.getByText('same').click();
  await panel.getByRole('button', { name: '$.b.y' }).click();
  await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.b.y');
});

test('large document tree stays responsive', async ({ page }) => {
  await page.goto('/');
  const big = JSON.stringify(Array.from({ length: 50000 }, (_, i) => ({ id: i, name: 'n' + i })));
  await page.evaluate((d) => navigator.clipboard.writeText(d), big);
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('tree')).toBeVisible();
  const count = await page.getByRole('treeitem').count();
  expect(count).toBeGreaterThan(5);
  expect(count).toBeLessThan(120); // virtualized
});

test('a 12 MB draft is autosaved (IndexedDB) and restored after reload', async ({ page }) => {
  await page.goto('/');
  const big = JSON.stringify({ d: 'x'.repeat(12 * 1024 * 1024) });
  await page.evaluate((d) => navigator.clipboard.writeText(d), big);
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Too large for draft autosave/)).toHaveCount(0);
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^12(\.\d)? MB$/)).toBeVisible();
});
