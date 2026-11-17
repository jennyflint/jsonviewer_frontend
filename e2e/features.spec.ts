import { expect, test } from '@playwright/test';
import { mockApi, setEditor } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

const USERS = JSON.stringify({
  users: [
    { id: 3, name: 'Cid', age: 44, tags: ['x'] },
    { id: 1, name: 'ann', age: 31 },
    { id: 2, name: 'Bob', age: 25 },
  ],
  meta: { total: 3, password: 'hunter2' },
});

test.describe('JSON5 / JSONC', () => {
  test('is accepted, flagged, and can be converted to strict JSON', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, "{ a: 1, // note\n 'b': [1, 2,], /* c */ }");
    await expect(page.getByText('Valid JSON')).toBeVisible();
    await expect(page.getByTestId('lenient-badge')).toBeVisible();
    await page.getByRole('button', { name: 'Convert to JSON' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Convert to JSON' }).click();
    await expect(page.getByTestId('lenient-badge')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('"a":');
    await expect(page.locator('.cm-content')).not.toContainText('note');
  });

  test('Format asks before dropping comments', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"a":1, /* keep? */ "b":2}');
    // no waiting for the parse here: Format must itself make sure the text was analysed
    await page.getByRole('button', { name: 'Format', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('removes comments');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.cm-content')).toContainText('keep?');
  });
});

test('Redact masks sensitive keys and regex matches', async ({ page }) => {
  await page.goto('/');
  await setEditor(
    page,
    '{"user":"ann","password":"hunter2","note":"mail ann@example.com","nested":{"api_token":"abc"}}',
  );
  await expect(page.getByText('Valid JSON')).toBeVisible();
  await page.getByRole('button', { name: 'Redact', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('redact-summary')).toContainText('2 values by key');
  await dlg.getByLabel('Mask text matching these regular expressions').fill('[\\w.]+@[\\w.]+');
  await expect(dlg.getByTestId('redact-summary')).toContainText('1 values by pattern');
  await dlg.getByRole('button', { name: 'Redact', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('"password":"***"');
  await expect(page.locator('.cm-content')).toContainText('"api_token":"***"');
  await expect(page.locator('.cm-content')).toContainText('mail ***');
  await expect(page.locator('.cm-content')).not.toContainText('hunter2');
});

test('Show only this branch focuses the tree on a subtree', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, USERS);
  await page.getByRole('tab', { name: 'Viewer' }).click();
  const items = page.getByRole('treeitem');
  await expect(items.first()).toContainText('$');
  await items.filter({ hasText: 'meta' }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Show only this branch' }).click();
  await expect(page.getByTestId('focus-banner')).toBeVisible();
  await expect(items.first()).toContainText('meta');
  await expect(items.first()).toHaveAttribute('aria-level', '1');
  await expect(items).toHaveCount(3); // meta + total + password
  await page.getByRole('button', { name: 'Show whole document' }).click();
  await expect(page.getByTestId('focus-banner')).toHaveCount(0);
  await expect(items.first()).toContainText('$');
});

test('Table view: columns, sorting, filtering', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, USERS);
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await page.getByRole('treeitem').filter({ hasText: 'users' }).first().click();
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(page.getByTestId('table-count')).toContainText('3 of 3');
  const ids = () =>
    page
      .getByTestId('table-scroll')
      .locator('[role=row]:not(.sticky) [role=cell]:nth-child(2)')
      .allInnerTexts();
  await expect.poll(ids).toEqual(['3', '1', '2']);
  await page.getByRole('columnheader', { name: 'id' }).click();
  await expect.poll(ids).toEqual(['1', '2', '3']);
  await page.getByRole('columnheader', { name: 'id' }).click();
  await expect.poll(ids).toEqual(['3', '2', '1']);
  await page.getByRole('searchbox', { name: 'Filter rows…' }).fill('bo');
  await expect(page.getByTestId('table-count')).toContainText('1 of 3');
  await page.getByTestId('table-scroll').locator('[role=row]:not(.sticky)').first().click();
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.users[2]');
});

test.describe('queries', () => {
  test('JSONPath and JMESPath', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, USERS);
    await expect(page.getByText('Valid JSON')).toBeVisible();
    await page.getByRole('button', { name: 'Query', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Query' });
    await panel.getByLabel('Query expression').fill('$.users[?(@.age>30)].name');
    await expect(panel.getByTestId('query-count')).toContainText('2 matches');
    await expect(panel.getByTestId('query-paths')).toBeHidden();
    await panel.getByText(/Matched nodes/).click();
    await expect(panel.getByTestId('query-paths')).toContainText('$.users[0].name');
    await panel.getByLabel('Query language').selectOption('jmespath');
    await panel.getByLabel('Query expression').fill('sort_by(users, &age)[0].name');
    await expect(panel.getByTestId('query-count')).toContainText('1 matches');
    await expect(panel.locator('.cm-content')).toContainText('Bob');
    await panel.getByLabel('Query expression').fill('users[?');
    await expect(panel.getByTestId('query-error')).toBeVisible();
  });

  test('the result can be opened as a new document', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, USERS);
    await expect(page.getByText('Valid JSON')).toBeVisible();
    await page.getByRole('button', { name: 'Query', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Query' });
    await panel.getByLabel('Query expression').fill('$..name');
    await expect(panel.getByTestId('query-count')).toContainText('3 matches');
    await panel.getByRole('button', { name: 'Open as new document' }).click();
    await expect(page.getByRole('tab', { name: /Query: \$\.\.name/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.cm-content').first()).toContainText('"Cid"');
  });
});

test('Bookmarks: star a node, list it, jump back', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, USERS);
  await page.getByRole('tab', { name: 'Viewer' }).click();
  const row = page.getByRole('treeitem').filter({ hasText: 'meta' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Add bookmark' }).click();
  await expect(row.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();
  await page.getByRole('treeitem').first().click();
  await page.getByRole('button', { name: /^Bookmarks/ }).click();
  const item = page.getByTestId('bookmark-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('$.meta');
  await item.getByRole('button', { name: '$.meta' }).first().click();
  await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.meta');
  // survives a reload
  await page.reload();
  await page.getByRole('tab', { name: 'Viewer' }).click();
  await page.getByRole('button', { name: /^Bookmarks/ }).click();
  await expect(page.getByTestId('bookmark-item')).toHaveCount(1);
});

test('Several documents: tabs keep their own content', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"first":1}');
  await expect(page.getByRole('tab', { name: /first/ })).toBeVisible();
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(page.locator('.cm-content').first()).not.toContainText('first');
  await setEditor(page, '{"second":2}');
  await expect(page.getByRole('tab', { name: /second/ })).toBeVisible();
  await page.getByRole('tab', { name: /first/ }).click();
  await expect(page.locator('.cm-content').first()).toContainText('"first":1');
  await page.getByRole('tab', { name: /second/ }).click();
  await expect(page.locator('.cm-content').first()).toContainText('"second":2');
  // rename
  await page.getByRole('tab', { name: /second/ }).dblclick();
  await page.getByLabel('Document name').fill('Config');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Config' })).toBeVisible();
  // survives reload
  await page.waitForTimeout(1300);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Config' })).toBeVisible();
  await expect(page.locator('.cm-content').first()).toContainText('"second":2');
  // close with confirmation
  await page.getByRole('button', { name: 'Close: Config' }).click();
  await page.getByRole('dialog').getByText('Close', { exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Config' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /first/ })).toBeVisible();
});

test('Versions: compare an earlier version with the current text and restore it', async ({ page }) => {
  await page.goto('/');
  await setEditor(page, '{"b":2,"a":1}');
  await expect(page.getByText('Valid JSON')).toBeVisible();
  await page.getByRole('button', { name: 'Sort keys' }).click(); // saves a version first
  await expect(page.locator('.cm-content')).toContainText('"a": 1');
  await page.getByRole('button', { name: 'Versions' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('version-list')).toContainText('Before Sort keys');
  await dlg.getByRole('button', { name: 'Compare with current' }).first().click();
  await expect(dlg.getByTestId('versions-diff')).toBeVisible();
  await expect(dlg.getByTestId('versions-diff').getByTestId('compare-stats')).toBeVisible();
  await dlg.getByRole('button', { name: 'Restore' }).first().click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.cm-content')).toContainText('{"b":2,"a":1}');
});

test('long jobs show a progress bar with Cancel', async ({ page }) => {
  test.setTimeout(120_000);
  const rows = (n: number, tag: string) =>
    JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i, v: tag + (i % 977), s: 'x'.repeat(20) })));
  await page.goto('/compare');
  const a = rows(60000, 'a');
  const b = rows(60000, 'b');
  await page.evaluate((d) => navigator.clipboard.writeText(d), a);
  await page.getByRole('button', { name: 'Paste' }).first().click();
  await page.evaluate((d) => navigator.clipboard.writeText(d), b);
  await page.getByRole('button', { name: 'Paste' }).nth(1).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const bar = page.getByTestId('job-bar');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(bar).toContainText('Comparing');
  await bar.getByRole('button', { name: 'Cancel' }).click();
  await expect(bar).toBeHidden();
  await expect(page.getByText('Cancelled')).toBeVisible();
  // the app still works after the worker was terminated
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByTestId('diff-view')).toHaveCount(0);
});

test.describe('sharing: passwords, one-time links, comments, node links', () => {
  test('password protected share', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"secret":"stuff"}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Password (optional)').fill('abc');
    await expect(dlg.getByRole('button', { name: 'Create link' })).toBeDisabled();
    await dlg.getByLabel('Password (optional)').fill('open-sesame');
    await dlg.getByRole('button', { name: 'Create link' }).click();
    await expect(dlg.getByLabel('Share link')).toHaveValue(/slug1/);
    await page.keyboard.press('Escape');
    await page.goto('/s/slug1');
    dlg = page.getByTestId('share-gate');
    await expect(dlg).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveCount(0);
    await dlg.getByLabel('Password').fill('nope-nope');
    await dlg.getByRole('button', { name: 'Open' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Wrong password');
    await dlg.getByLabel('Password').fill('open-sesame');
    await dlg.getByRole('button', { name: 'Open' }).click();
    await expect(page.locator('.cm-content')).toContainText('stuff');
    await expect(page.getByText('Password protected')).toBeVisible();
  });

  test('one-time link is destroyed after the first open', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"once":true}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('One-time link (deleted after the first view)').check();
    await dlg.getByRole('button', { name: 'Create link' }).click();
    await expect(dlg.getByLabel('Share link')).toHaveValue(/slug1/);
    await page.keyboard.press('Escape');
    await page.goto('/s/slug1');
    const gate = page.getByTestId('share-gate');
    await expect(gate).toContainText('destroyed as soon as you open it');
    await expect(page.locator('.cm-content')).toHaveCount(0); // merely visiting did not consume or show it
    await gate.getByRole('button', { name: 'Open and destroy' }).click();
    await expect(page.locator('.cm-content')).toContainText('once');
    await expect(page.getByTestId('burn-banner')).toBeVisible();
    await page.goto('/s/slug1');
    await expect(page.getByTestId('share-not-found')).toBeVisible();
  });

  test('comments: add (anchored to a node), jump, delete as the creator', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"a":{"b":1}}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Allow comments').check();
    await dlg.getByRole('button', { name: 'Create link' }).click();
    await expect(dlg.getByLabel('Share link')).toHaveValue(/slug1/);
    await page.keyboard.press('Escape');
    await page.goto('/s/slug1');
    await page.getByRole('tab', { name: 'Viewer' }).click();
    await page.getByRole('textbox', { name: 'JSON path' }).fill('$.a.b');
    await page.getByRole('textbox', { name: 'JSON path' }).press('Enter');
    await page.getByRole('button', { name: 'Comments' }).click();
    const panel = page.getByRole('complementary', { name: 'Comments' });
    await expect(panel).toContainText('No comments yet');
    await panel.getByLabel('Your name').fill('Ann');
    await panel.getByLabel('Write a comment…').fill('Why is b equal to 1? <b>bold</b>');
    await expect(panel).toContainText('Attach to the selected node ($.a.b)');
    await panel.getByRole('button', { name: 'Send' }).click();
    const c = panel.getByTestId('comment');
    await expect(c).toContainText('Ann');
    await expect(c).toContainText('<b>bold</b>'); // rendered as text, never as HTML
    await expect(c.locator('b')).toHaveCount(0);
    await c.getByRole('button', { name: 'On $.a.b' }).click();
    await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.a.b');
    await c.getByRole('button', { name: 'Delete' }).click(); // the creator holds the delete token
    await expect(panel).toContainText('No comments yet');
  });

  test('node links select the node on load', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"a":{"b":[10,20,30]}}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
    await expect(page.getByRole('dialog').getByLabel('Share link')).toHaveValue(/slug1/);
    await page.keyboard.press('Escape');
    await page.goto('/s/slug1?path=' + encodeURIComponent('$.a.b[1]'));
    await expect(page.getByRole('textbox', { name: 'JSON path' })).toHaveValue('$.a.b[1]');
    await expect(page.getByRole('treeitem', { selected: true })).toContainText('20');
    await page.getByRole('button', { name: 'Link to this node' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /\/s\/slug1\?path=%24\.a\.b%5B1%5D$/,
    );
  });

  test('share dialog can redact sensitive keys before sending', async ({ page }) => {
    const state = await mockApi(page);
    await page.goto('/');
    await setEditor(page, '{"user":"ann","password":"hunter2"}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Redact sensitive keys (password, token, secret …)').check();
    await dlg.getByRole('button', { name: 'Create link' }).click();
    await expect(dlg.getByLabel('Share link')).toHaveValue(/slug1/);
    const body = state.calls.find((c) => c.method === 'POST' && c.path === '/shares')?.body as {
      content: string;
    };
    expect(body.content).toBe('{"user":"ann","password":"***"}');
  });
});

test.describe('feature switches in Settings', () => {
  const openSettings = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    return page.getByTestId('feature-switches');
  };

  test('all features are on by default and each name has a description on hover', async ({ page }) => {
    await page.goto('/');
    const box = await openSettings(page);
    const switches = box.getByRole('switch');
    await expect(switches).toHaveCount(11);
    for (const s of await switches.all()) await expect(s).toBeChecked();
    await box.getByText('Redact', { exact: true }).hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'Masks sensitive values' })).toBeVisible();
    await box.getByText('Table view').focus();
    await expect(page.getByRole('tooltip').filter({ hasText: 'sortable, filterable table' })).toBeVisible();
  });

  test('switching features off hides them (and the choice persists)', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"a":[{"x":1}],"password":"p"}');
    await expect(page.getByText('Valid JSON')).toBeVisible();
    for (const name of ['Redact', 'Query', 'Versions', 'Duplicates'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Table' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New document' })).toBeVisible();

    const box = await openSettings(page);
    for (const label of [
      'Duplicates',
      'Query (JSONPath / JMESPath)',
      'Table view',
      'Redact',
      'Versions',
      'Several documents (tabs)',
    ]) {
      await box.getByLabel(label, { exact: true }).uncheck();
    }
    await page.keyboard.press('Escape');
    for (const name of ['Redact', 'Query', 'Versions', 'Duplicates'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Table' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New document' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Viewer' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Redact', exact: true })).toHaveCount(0);
    const again = await openSettings(page);
    await again.getByRole('button', { name: 'Enable all' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Redact', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Table' })).toBeVisible();
  });

  test('bookmarks and "show only this branch" can be disabled', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, USERS);
    await page.getByRole('tab', { name: 'Viewer' }).click();
    await expect(page.getByRole('button', { name: /^Bookmarks/ })).toBeVisible();
    const box = await openSettings(page);
    await box.getByLabel('Bookmarks', { exact: true }).uncheck();
    await box.getByLabel('Show only this branch', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Bookmarks/ })).toHaveCount(0);
    const row = page.getByRole('treeitem').filter({ hasText: 'meta' }).first();
    await row.hover();
    await expect(row.getByRole('button', { name: 'Add bookmark' })).toHaveCount(0);
    await row.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Show only this branch' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Copy path' })).toBeVisible();
  });

  test('JSON5 support can be switched off: comments are then plain errors', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"a":1, // c\n "b":2}');
    await expect(page.getByTestId('lenient-badge')).toBeVisible();
    const box = await openSettings(page);
    await box.getByLabel('JSON5 / JSONC support', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('lenient-badge')).toHaveCount(0);
    await expect(page.getByRole('status').getByText(/Invalid/)).toBeVisible();
  });

  test('share options and the progress bar can be disabled', async ({ page }) => {
    await page.goto('/');
    await setEditor(page, '{"a":1}');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByLabel('Password (optional)')).toBeVisible();
    await page.keyboard.press('Escape');
    const box = await openSettings(page);
    await box.getByLabel('Share options', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByLabel('Share link').or(page.getByRole('dialog').getByText('Create link')),
    ).toBeVisible();
    await expect(page.getByLabel('Password (optional)')).toHaveCount(0);
    await expect(page.getByLabel('Allow comments')).toHaveCount(0);
  });
});
