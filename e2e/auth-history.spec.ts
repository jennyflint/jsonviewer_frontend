import { expect, test } from '@playwright/test';
import { USER, historyEntry, mockApi } from './helpers';

test('anonymous: history shows a sign-in card (no redirect) with provider buttons', async ({ page }) => {
  await mockApi(page);
  await page.goto('/history');
  await expect(page.getByTestId('auth-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('link', { name: 'History' })).toHaveCount(0);
});

test('sign in is a full-page navigation with a relative return_to', async ({ page }) => {
  await mockApi(page, { providers: ['github'] });
  let navigated = '';
  await page.route('**/api/auth/github/login**', (r) => {
    navigated = r.request().url();
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'redirected' });
  });
  await page.goto('/history');
  await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
  await expect.poll(() => navigated).toContain('/api/auth/github/login?return_to=%2Fhistory');
});

test('login page translates oauth errors', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login?error=oauth_cancelled');
  await expect(page.getByRole('alert')).toContainText('Sign-in was cancelled.');
  await page.goto('/login?error=weird_code');
  await expect(page.getByRole('alert')).toContainText('Sign-in failed');
});

test('signed in: history list → open, rename, pin, delete with undo, compare two', async ({ page }) => {
  const state = await mockApi(page, {
    user: USER,
    history: [
      historyEntry('h1', 'First doc', '{"a":1,"b":2}'),
      historyEntry('h2', 'Second doc', '{"a":1,"b":3}'),
      historyEntry('h3', 'Third doc', '[1,2,3]'),
    ],
  });
  await page.goto('/history');
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'History' })).toBeVisible();

  // rename
  await items.filter({ hasText: 'Third doc' }).getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Entry title').fill('Renamed');
  await page.keyboard.press('Enter');
  await expect(items.filter({ hasText: 'Renamed' })).toBeVisible();
  expect(state.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ title: 'Renamed' });

  // pin
  await items.first().getByRole('button', { name: 'Pin' }).click();
  expect(state.calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);

  // delete + undo
  await items.filter({ hasText: 'Renamed' }).getByRole('button', { name: 'Delete' }).click();
  await expect(items).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(items).toHaveCount(3);
  expect(state.calls.filter((c) => c.method === 'POST' && c.path === '/history')).toHaveLength(1);

  // search is debounced into the URL
  await page.getByRole('searchbox', { name: 'Search history…' }).fill('Second');
  await expect(page).toHaveURL(/q=Second/);
  await expect(items).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search history…' }).fill('');
  await expect(items).toHaveCount(3);

  // compare two
  await items.filter({ hasText: 'First doc' }).getByRole('checkbox').check();
  await items.filter({ hasText: 'Second doc' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Compare selected' }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.getByTestId('compare-stats')).toBeVisible();
  await expect(page.getByTestId('change-list')).toContainText('$.b');

  // open
  await page.goto('/history');
  await page
    .getByTestId('history-item')
    .filter({ hasText: 'First doc' })
    .getByRole('button', { name: 'Open' })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.cm-content')).toContainText('"a":1,"b":2');
});

test('history empty state and clear-all with typed confirmation', async ({ page }) => {
  const state = await mockApi(page, { user: USER, history: [historyEntry('h1', 'One', '{}')] });
  await page.goto('/history');
  await page.getByRole('button', { name: 'Clear all history' }).click();
  const dlg = page.getByRole('dialog');
  const confirm = dlg.getByRole('button', { name: 'Clear all history' });
  await expect(confirm).toBeDisabled();
  await dlg.getByRole('textbox').fill('DELETE');
  await confirm.click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
  expect(state.calls.find((c) => c.method === 'DELETE' && c.path === '/history')?.body).toEqual({
    confirm: true,
  });
});

test('formatting while signed in autosaves to history; CSRF header is sent on unsafe requests', async ({
  page,
  context,
}) => {
  const state = await mockApi(page, { user: USER });
  await context.addCookies([{ name: 'csrftoken', value: 'abc123', url: 'http://localhost:4173' }]);
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('{"x":1}');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect
    .poll(() => state.calls.filter((c) => c.method === 'POST' && c.path === '/history').length)
    .toBe(1);
  const call = state.calls.find((c) => c.path === '/history' && c.method === 'POST');
  expect(call?.headers['x-csrf-token']).toBe('abc123');
  expect(call?.body).toMatchObject({ source: 'format' });
});

test('account page: sessions, revoke and delete account', async ({ page }) => {
  const state = await mockApi(page, { user: USER });
  await page.goto('/account');
  await expect(page.getByText('ann@example.com')).toBeVisible();
  await expect(page.getByText('Current')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  expect(state.calls.some((c) => c.method === 'DELETE' && c.path === '/auth/sessions/s2')).toBe(true);
  await page.getByRole('button', { name: 'Delete account' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox').fill('DELETE');
  await dlg.getByRole('button', { name: 'Delete account' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(state.calls.some((c) => c.method === 'DELETE' && c.path === '/auth/account')).toBe(true);
  await expect(page.getByRole('button', { name: /Sign in/ })).toBeVisible();
});

test('expired session (401) clears the user and shows a toast', async ({ page }) => {
  const state = await mockApi(page, { user: USER });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
  await page.route('**/api/history', (r) =>
    r.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'auth_required', message: 'x', details: null } }),
    }),
  );
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('{"x":1}');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.getByText('Session expired — sign in again')).toBeVisible();
  await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
  void state;
});

test('Sign in button shows a tooltip with the benefits on hover and focus', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const btn = page.getByRole('button', { name: 'Sign in' });
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeHidden();
  await btn.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Sign in to get:');
  await expect(tip).toContainText('personal history');
  await expect(tip).toContainText('never expire');
  await page.mouse.move(400, 400);
  await expect(tip).toBeHidden();
  await btn.focus();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('no sign-in tooltip for signed-in users', async ({ page }) => {
  await mockApi(page, { user: USER });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
