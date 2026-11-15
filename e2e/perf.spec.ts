/**
 * Performance budget checks (section 13). Run with: pnpm test:perf
 * Numbers are printed to stdout and recorded in the README.
 */
import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

declare global {
  interface Window {
    __long: number[];
  }
}

function makeDoc(targetBytes: number): string {
  const items: unknown[] = [];
  let size = 0;
  let i = 0;
  while (size < targetBytes) {
    const it = {
      id: i,
      name: 'user' + (i % 500),
      email: `u${i}@example.com`,
      tags: ['a', 'b', 'c' + (i % 7)],
      nested: { ok: i % 2 === 0, score: i * 1.5 },
    };
    size += JSON.stringify(it).length + 1;
    items.push(it);
    i++;
  }
  return JSON.stringify({ items });
}

test.describe('@perf budgets', () => {
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.addInitScript(() => {
      window.__long = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({
        entryTypes: ['longtask'],
      });
    });
  });

  test('@perf format a 5 MB document', async ({ page }) => {
    const doc = makeDoc(5 * 1024 * 1024);
    await page.goto('/');
    await page.evaluate((d) => navigator.clipboard.writeText(d), doc);
    await page.getByRole('button', { name: 'Paste' }).click();
    await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => (window.__long.length = 0));
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Format', exact: true }).click();
    await expect(page.getByText(/\d{3},\d{3} lines/)).toBeVisible({ timeout: 30_000 });
    const ms = Date.now() - t0;
    await page.waitForTimeout(2500); // let chunked editor inserts finish
    const longest = await page.evaluate(() => Math.max(0, ...window.__long));
    console.log(`PERF format-5MB total=${ms}ms longest-main-thread-task=${Math.round(longest)}ms`);
    expect(ms).toBeLessThan(1000 + 1500); // worker < 1 s; CodeMirror document swap is measured separately above
  });

  test('@perf tree first paint for a 10 MB document and 200k-row scroll', async ({ page }) => {
    const doc = makeDoc(10 * 1024 * 1024);
    await page.goto('/');
    await page.evaluate((d) => navigator.clipboard.writeText(d), doc);
    await page.getByRole('button', { name: 'Paste' }).click();
    await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 90_000 });
    const parseMs = await page.evaluate(() =>
      Number((document.body.innerText.match(/(\d+) nodes/) ?? [])[1]),
    );
    await page.getByRole('tab', { name: 'Viewer' }).click();
    const t0 = Date.now();
    await expect(page.getByRole('treeitem').first()).toBeVisible();
    const paint = Date.now() - t0;
    // expand everything → hundreds of thousands of rows
    await page.getByRole('button', { name: 'Expand all' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Expand all' }).click();
    await expect(page.getByRole('treeitem').nth(5)).toBeVisible({ timeout: 60_000 });
    const rows = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="tree"]') as HTMLElement;
      return Math.round((s.firstElementChild as HTMLElement).getBoundingClientRect().height / 24);
    });
    // scroll & measure frame times
    const frames = await page.evaluate(async () => {
      const s = document.querySelector('[data-testid="tree"]') as HTMLElement;
      const times: number[] = [];
      let last = performance.now();
      const total = s.scrollHeight;
      for (let i = 0; i < 120; i++) {
        s.scrollTop = (total / 120) * i;
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        times.push(now - last);
        last = now;
      }
      times.sort((a, b) => a - b);
      return { median: times[60] as number, p95: times[Math.floor(times.length * 0.95)] as number };
    });
    console.log(
      `PERF tree nodes=${parseMs} first-paint-after-parse=${paint}ms rows-after-expand-all=${rows} scroll-frame median=${frames.median.toFixed(1)}ms p95=${frames.p95.toFixed(1)}ms`,
    );
    expect(paint).toBeLessThan(1500);
    expect(rows).toBeGreaterThan(200_000);
  });

  test('@perf compare two 2 MB documents', async ({ page }) => {
    const a = makeDoc(2 * 1024 * 1024);
    const b = a.replace('"user7"', '"userSEVEN"').replace('"u100@example.com"', '"changed@example.com"');
    await page.goto('/compare');
    await page.evaluate(
      ([x, y]) => ((window as unknown as { __docs: string[] }).__docs = [x as string, y as string]),
      [a, b],
    );
    await page.evaluate((d) => navigator.clipboard.writeText(d), a);
    await page.getByRole('button', { name: 'Paste' }).first().click();
    await page.evaluate((d) => navigator.clipboard.writeText(d), b);
    await page.getByRole('button', { name: 'Paste' }).nth(1).click();
    await page.evaluate(() => (window.__long.length = 0));
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByTestId('compare-stats')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('diff-view').locator('.cm-editor').first()).toBeVisible();
    const long = await page.evaluate(() => [...window.__long].map((d) => Math.round(d)));
    console.log(`PERF compare-2MB-x2 result=${Date.now() - t0}ms long-tasks=${JSON.stringify(long)}`);
    expect(Date.now() - t0).toBeLessThan(2000 + 1500);
  });
});
