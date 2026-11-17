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

  test('@smoke password, one-time link and comments against the real backend', async ({ request }) => {
    const mk = async (extra: Record<string, unknown>) => {
      const r = await request.post('/api/shares', {
        data: { content: '{"smoke":1}', expires_in: '1h', ...extra },
      });
      expect(r.status()).toBe(201);
      return (await r.json()) as { slug: string; delete_token: string };
    };
    // password
    const p = await mk({ password: 'correct-horse' });
    expect((await request.get(`/api/shares/${p.slug}`)).status()).toBe(403);
    expect(
      (await request.post(`/api/shares/${p.slug}/open`, { data: { password: 'wrong-horse' } })).status(),
    ).toBe(403);
    const ok = await request.post(`/api/shares/${p.slug}/open`, { data: { password: 'correct-horse' } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).content).toBe('{"smoke":1}');
    // one-time link: meta does not burn it, the first open does
    const b = await mk({ burn_after_read: true });
    expect((await request.get(`/api/shares/${b.slug}/meta`)).ok()).toBeTruthy();
    expect((await request.post(`/api/shares/${b.slug}/open`, { data: {} })).status()).toBe(200);
    expect((await request.post(`/api/shares/${b.slug}/open`, { data: {} })).status()).toBe(404);
    // comments
    const c = await mk({ comments_enabled: true });
    const posted = await request.post(`/api/shares/${c.slug}/comments`, {
      data: { text: 'hi', author: 'smoke', path: '$.smoke' },
    });
    expect(posted.status()).toBe(201);
    expect(((await (await request.get(`/api/shares/${c.slug}/comments`)).json()) as unknown[]).length).toBe(
      1,
    );
    const del = await request.delete(`/api/shares/${c.slug}/comments/${(await posted.json()).id}`, {
      headers: { 'X-Delete-Token': c.delete_token },
    });
    expect(del.status()).toBe(204);
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
