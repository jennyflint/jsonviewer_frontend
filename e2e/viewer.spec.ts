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

test('Viewer: highlighting toggle switches type colours off and on', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"s":"text"}');
  await page.getByRole('tab', { name: 'Viewer' }).click();
  const btn = page.getByRole('button', { name: 'JSON highlighting' });
  const wrap = page.locator('.tree-plain');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(wrap).toHaveCount(0);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(wrap).toHaveCount(1);
});

test('Text tab: highlighting toggle removes and restores syntax colours', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"s":"text"}');
  const btn = page.getByRole('button', { name: 'JSON highlighting' });
  const coloured = () => page.locator('.cm-content span[class^="ͼ"]').count();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(coloured).toBeGreaterThan(0);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(coloured).toBe(0);
  await btn.click();
  await expect.poll(coloured).toBeGreaterThan(0);
});

test('Text tab: syntax highlighting still works for an 8 MB document', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const big = JSON.stringify(
    Array.from({ length: 200000 }, (_, i) => ({ id: i, name: 'user' + i, ok: true })),
  );
  expect(big.length).toBeGreaterThan(8 * 1024 * 1024);
  await page.evaluate((d) => navigator.clipboard.writeText(d), big);
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => page.locator('.cm-content span[class^="ͼ"]').count(), { timeout: 60_000 })
    .toBeGreaterThan(0);
});

test('Text tab: collapse all / expand all fold the document', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, JSON.stringify({ a: { x: 1, y: [1, 2, 3] }, b: { z: 2 } }, null, 2));
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  const lines = page.locator('.cm-content .cm-line');
  await expect.poll(() => lines.count()).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect.poll(() => lines.count()).toBeLessThan(5);
  await expect(page.locator('.cm-foldPlaceholder').first()).toBeVisible();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect.poll(() => lines.count()).toBeGreaterThan(10);
});

test('keys are coloured by value type, in Text and Viewer, and the colours are configurable', async ({
  page,
}) => {
  await page.goto('/');
  await setEditor(page, '{"s":"x","n":1,"b":true,"a":[1],"o":{"k":null}}');
  await expect(page.getByText('Valid JSON')).toBeVisible();
  for (const t of ['string', 'number', 'boolean', 'array', 'object', 'null']) {
    await expect(page.locator(`.cm-content .cm-k-${t}`).first()).toBeVisible();
  }
  const colorOf = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => getComputedStyle(el).color);
  const a = await colorOf('.cm-content .cm-k-string');
  const b = await colorOf('.cm-content .cm-k-number');
  expect(a).not.toBe(b);

  // configure: string keys red
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('string', { exact: true }).fill('#ff0000');
  await page.keyboard.press('Escape');
  await expect.poll(() => colorOf('.cm-content .cm-k-string')).toBe('rgb(255, 0, 0)');
  await page.getByRole('tab', { name: 'Viewer' }).click();
  const row = page.getByRole('treeitem').filter({ hasText: 'x' }).filter({ hasText: '"s"' }).first();
  void row;
  await expect
    .poll(() =>
      page
        .locator('[role=treeitem] span.font-semibold')
        .nth(1)
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(255, 0, 0)');

  // highlighting off → plain keys
  await page.getByRole('button', { name: 'JSON highlighting' }).click();
  await page.getByRole('tab', { name: 'Text' }).click();
  await expect(page.locator('.cm-content .cm-k-string')).toHaveCount(0);
});

test('Text tab: indent guides toggle draws and removes the vertical lines', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, JSON.stringify({ a: { b: { c: [1, 2, 3] } }, d: 1 }, null, 2));
  const btn = page.getByRole('button', { name: 'Indent guides' });
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cm-indent-guide')).toHaveCount(0);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('.cm-indent-guide').count()).toBeGreaterThan(5);
  await page.screenshot({
    clip: { x: 0, y: 100, width: 600, height: 300 },
  });
  await btn.click();
  await expect(page.locator('.cm-indent-guide')).toHaveCount(0);
});

test('Text tab: the guide of the active block is highlighted', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, JSON.stringify({ a: { b: { c: [1, 2, 3] } }, d: 1 }, null, 2));
  await page.getByRole('button', { name: 'Indent guides' }).click();
  const active = page.locator('.cm-indent-active');
  await page.locator('.cm-line', { hasText: /^\s+2,$/ }).click();
  await expect.poll(() => active.count()).toBe(3);
  await page.locator('.cm-line', { hasText: '"a": {' }).click();
  await expect.poll(() => active.count()).toBe(7);
});

test('Text tab: the matching bracket is highlighted (also in a large document)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await setEditor(page, '{"a":[1,2],"b":{"c":3}}');
  await page.locator('.cm-line').first().click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.cm-matchingBracket').count()).toBe(2);
  await expect(page.locator('.cm-matchingBracket').first()).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.cm-matchingBracket').count()).toBe(0);

  const big = JSON.stringify(
    { items: Array.from({ length: 150000 }, (_, i) => ({ id: i, n: 'u' + i })) },
    null,
    1,
  );
  expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
  await page.evaluate((d) => navigator.clipboard.writeText(d), big);
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 60_000 });
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await expect.poll(() => page.locator('.cm-matchingBracket').count(), { timeout: 20_000 }).toBe(2);
});

test('toolbar order: Clear is the first button, then Paste', async ({ page }) => {
  await page.goto('/');
  const names = await page.getByRole('toolbar').first().getByRole('button').allInnerTexts();
  expect(names[0]?.trim()).toBe('Clear');
  expect(names[1]?.trim()).toBe('Paste');
});
