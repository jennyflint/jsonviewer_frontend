import { expect, test } from '@playwright/test';
import { mockApi, setEditor } from './helpers';
import { readFileSync } from 'node:fs';

const LEFT = '{"id":1,"name":"Ann","tags":["a","b"],"keep":true,"drop":1}';
const RIGHT = '{"id":1,"name":"Anna","tags":["a","b","c"],"keep":true,"added":"x"}';

test('compare two docs: stats, views, change navigation, patch download', async ({ page }) => {
  await mockApi(page);
  await page.goto('/compare');
  await setEditor(page, LEFT, 0);
  await setEditor(page, RIGHT, 1);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByTestId('compare-stats')).toContainText('additions');
  await expect(page.getByTestId('diff-view')).toBeVisible();
  // side-by-side by default → two editors
  await expect(page.getByTestId('diff-view').locator('.cm-editor')).toHaveCount(2);
  await expect(page.locator('.cm-changedLine').first()).toBeVisible();

  // structural list
  const list = page.getByTestId('change-list');
  await expect(list).toContainText('$.added');
  await expect(list).toContainText('$.drop');
  await expect(list).toContainText('$.name');
  await expect(list).toContainText('$.tags[2]');

  await page.getByRole('combobox', { name: 'Side-by-side' }).selectOption('unified');
  await expect(page.getByTestId('diff-view').locator('.cm-editor')).toHaveCount(1);

  await expect(page.getByTestId('change-counter')).toContainText(/of \d+/);
  await page.getByRole('button', { name: /Next change/ }).click();
  await expect(page.getByTestId('change-counter')).toContainText(/Change 1 of/);
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByTestId('change-counter')).toContainText(/Change 2 of/);

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .patch' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('changes.patch');
  const patch = readFileSync((await dl.path()) as string, 'utf8');
  expect(patch).toContain('--- left.json');
  expect(patch).toContain('+++ right.json');
  expect(patch).toContain('+  "added": "x"');
});

test('key order differences are ignored by default and detected when turned off', async ({ page }) => {
  await mockApi(page);
  await page.goto('/compare');
  await setEditor(page, '{"a":1,"b":2}', 0);
  await setEditor(page, '{"b":2,"a":1}', 1);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No differences' })).toBeVisible();
  await page.getByLabel('Ignore key order').uncheck();
  await expect(page.getByRole('status').filter({ hasText: 'No differences' })).toHaveCount(0);
});

test('invalid side shows the error and offers a raw text fallback', async ({ page }) => {
  await mockApi(page);
  await page.goto('/compare');
  await setEditor(page, '{"a":1', 0);
  await setEditor(page, '{"a":2}', 1);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Left side is not valid JSON');
  await page.getByRole('button', { name: 'Compare as raw text' }).click();
  await expect(page.getByText('Raw text comparison')).toBeVisible();
  await expect(page.getByTestId('diff-view')).toBeVisible();
});

test('share a comparison and open it read-only', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/compare');
  await setEditor(page, LEFT, 0);
  await setEditor(page, RIGHT, 1);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('button', { name: 'Share comparison' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByRole('dialog').getByLabel('Share link')).toHaveValue(/slug1/);
  const body = state.calls.find((c) => c.method === 'POST' && c.path === '/shares')?.body as {
    kind: string;
    content_right: string;
  };
  expect(body.kind).toBe('compare');
  expect(body.content_right).toBe(RIGHT);
  await page.keyboard.press('Escape');
  await page.goto('/s/slug1');
  await expect(page.getByTestId('diff-view')).toBeVisible();
  await page.getByRole('button', { name: 'Open in Compare' }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.getByTestId('compare-stats')).toBeVisible();
});
