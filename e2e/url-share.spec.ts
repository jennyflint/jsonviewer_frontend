import { expect, test } from '@playwright/test';
import { err, mockApi, setEditor } from './helpers';

test('load from URL: success replaces the editor, blocked shows a friendly error', async ({ page }) => {
  const state = await mockApi(page);
  state.fetchResponse = (url) =>
    url.includes('internal')
      ? { status: 422, body: err('blocked_destination', 'blocked') }
      : {
          status: 200,
          body: {
            url,
            final_url: url,
            status_code: 200,
            content_type: 'application/json',
            size_bytes: 24,
            is_valid_json: true,
            parse_error: null,
            content: '{"from":"url","n":[1,2]}',
          },
        };
  await page.goto('/');
  await page.getByRole('button', { name: 'Load JSON data' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('URL').fill('http://192.168.0.1/internal.json');
  await dlg.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(dlg.getByRole('alert')).toContainText('not allowed');
  await dlg.getByLabel('URL').fill('https://example.com/data.json');
  await dlg.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.cm-content')).toContainText('"from":"url"');
  expect(state.calls.filter((c) => c.path === '/fetch')).toHaveLength(2);
});

test('load from URL rejects non-http schemes before calling the API', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load JSON data' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('URL').fill('file:///etc/passwd');
  await expect(dlg.getByText('Enter a valid http:// or https:// URL.')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Load', exact: true })).toBeDisabled();
  expect(state.calls.filter((c) => c.path === '/fetch')).toHaveLength(0);
});

test('?url= deep link asks for confirmation before fetching', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/?url=https://example.com/a.json');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('https://example.com/a.json');
  expect(state.calls.filter((c) => c.path === '/fetch')).toHaveLength(0);
  await dlg.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('"from":"url"');
});

test('dirty editor asks before being replaced by a URL load', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await setEditor(page, '{"mine":true}');
  await page.getByRole('button', { name: 'Load JSON data' }).click();
  await page.getByRole('dialog').getByLabel('URL').fill('https://example.com/a.json');
  await page.getByRole('dialog').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Replace' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.cm-content')).toContainText('"mine":true');
});

test('anonymous share → open /s/:slug → delete with the local token', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/');
  await setEditor(page, '{"shared":[1,2,3]}');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('option', { name: 'Never' })).toBeDisabled();
  await expect(dlg.getByText(/stored in this browser/)).toBeVisible();
  await dlg.getByLabel('Title (optional)').fill('My doc');
  await dlg.getByRole('button', { name: 'Create link' }).click();
  const link = await dlg.getByLabel('Share link').inputValue();
  expect(link).toMatch(/\/s\/slug1$/);
  expect(await page.evaluate(() => localStorage.getItem('jv.shares.v1'))).toContain('tok-slug1');
  await page.keyboard.press('Escape');

  await page.goto('/s/slug1');
  await expect(page.getByRole('heading', { name: 'My doc' })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('"shared"');
  await page.getByRole('button', { name: 'Delete share' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const del = state.calls.find((c) => c.method === 'DELETE' && c.path === '/shares/slug1');
  expect(del?.headers['x-delete-token']).toBe('tok-slug1');

  await page.goto('/s/slug1');
  await expect(page.getByTestId('share-not-found')).toBeVisible();
});

test('shared page "Open in editor" copies the content into the main document', async ({ page }) => {
  const state = await mockApi(page);
  state.shares.set('abc', {
    slug: 'abc',
    kind: 'single',
    title: null,
    content: '{"hello":"world"}',
    content_right: null,
    size_bytes: 17,
    created_at: '2025-01-01T00:00:00Z',
    expires_at: null,
    view_count: 7,
    is_owner: false,
  });
  await page.goto('/s/abc');
  await expect(page.getByText('7 views')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete share' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open in editor' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.cm-content')).toContainText('"hello":"world"');
});

test('shared page does not touch the draft of the viewer', async ({ page }) => {
  const state = await mockApi(page);
  state.shares.set('abc', {
    slug: 'abc',
    kind: 'single',
    title: null,
    content: '{"hello":"world"}',
    content_right: null,
    size_bytes: 17,
    created_at: '2025-01-01T00:00:00Z',
    expires_at: null,
    view_count: 1,
    is_owner: false,
  });
  await page.goto('/');
  await setEditor(page, '{"draft":1}');
  await page.waitForTimeout(1200);
  await page.goto('/s/abc');
  await expect(page.locator('.cm-content')).toContainText('"hello"');
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('"draft":1');
});

test('share size limit is checked before calling the API', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/');
  const big = JSON.stringify({ d: 'x'.repeat(15 * 1024 * 1024 + 10) });
  await page.evaluate((d) => navigator.clipboard.writeText(d), big);
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('too large');
  expect(state.calls.filter((c) => c.path === '/shares')).toHaveLength(0);
});
