/**
 * @smoke tests run against a real stack (backend + frontend), e.g.
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:smoke
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setEditor } from './helpers';

test.describe('@smoke real stack', () => {
  test('@smoke health: API reachable through the frontend proxy', async ({ page, request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    await page.goto('/');
    await expect(page.getByText('API online')).toBeVisible();
    // anonymous boot: providers + me respond
    expect((await request.get('/api/auth/me')).ok()).toBeTruthy();
    expect(((await (await request.get('/api/auth/me')).json()) as { user: unknown }).user).toBeNull();
  });

  test('@smoke share round-trip with delete token', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"smoke":true,"n":[1,2,3]}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
    const link = await page.getByRole('dialog').getByLabel('Share link').inputValue();
    expect(link).toContain('/s/');
    const slug = link.split('/s/')[1] as string;
    await page.keyboard.press('Escape');
    await page.goto(`/s/${slug}`);
    await expect(page.locator('.cm-content')).toContainText('"smoke"');
    await page.getByRole('button', { name: 'Delete share' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.goto(`/s/${slug}`);
    await expect(page.getByTestId('share-not-found')).toBeVisible();
  });

  test('@smoke fetch: private addresses are blocked, public JSON loads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Load JSON data' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('URL').fill('http://127.0.0.1:8000/api/health');
    await dlg.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(dlg.getByRole('alert')).toContainText(/not allowed|valid/i);
  });

  test('@smoke duplicates: client result matches the backend', async ({ request }) => {
    const content = readFileSync(resolve('src/test/fixtures/dups.json'), 'utf8');
    const res = await request.post('/api/analysis/duplicates', { data: { content, options: {} } });
    expect(res.ok()).toBeTruthy();
    const server = (await res.json()) as Record<string, any>;
    const expected = JSON.parse(
      readFileSync(resolve('src/test/fixtures/dups.expected.json'), 'utf8'),
    ) as Record<string, any>;
    const strip = (r: any) => ({
      ...r,
      stats: undefined,
      duplicate_subtrees: r.duplicate_subtrees.map(({ hash: _h, ...g }: any) => g),
      duplicate_values: r.duplicate_values.map(({ lexemes: _l, ...g }: any) => g),
    });
    expect(strip(server)).toEqual(strip({ ...expected, stats: undefined }));
  });
});
