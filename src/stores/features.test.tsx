import '../test/fakeWorkers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BOOKMARKS,
  addBookmark,
  bookmarksOf,
  dropBookmarks,
  isBookmarked,
  removeBookmark,
  renameBookmark,
  toggleBookmark,
} from './bookmarks';
import {
  MAX_SNAPSHOTS,
  addSnapshot,
  dropSnapshots,
  loadSnapshots,
  removeSnapshot,
  snapshotsOf,
} from './snapshots';
import { cancelJob, jobs, runJob } from './jobs';
import {
  MAX_TABS,
  activateTab,
  activeStore,
  activeTabId,
  autoTitle,
  closeTab,
  newTab,
  renameTab,
  storeFor,
  tabs,
} from './tabs';
import { createDocument } from './documentFactory';
import { clearToasts } from './toasts';

beforeEach(() => {
  localStorage.clear();
  clearToasts();
});

describe('bookmarks', () => {
  it('toggles, renames, removes and is scoped per tab', () => {
    expect(toggleBookmark('t1', '$.a')).toBe(true);
    expect(isBookmarked('t1', '$.a')).toBe(true);
    expect(isBookmarked('t2', '$.a')).toBe(false);
    addBookmark('t1', '$.a'); // duplicates are ignored
    addBookmark('t1', '$.b', 'Bee');
    expect(bookmarksOf('t1').map((b) => b.label)).toEqual(['$.a', 'Bee']);
    renameBookmark('t1', '$.a', '  Alpha ');
    renameBookmark('t1', '$.b', '   '); // empty label falls back to the path
    expect(bookmarksOf('t1').map((b) => b.label)).toEqual(['Alpha', '$.b']);
    expect(localStorage.getItem('jv.bookmarks.v1')).toContain('Alpha');
    removeBookmark('t1', '$.a');
    expect(toggleBookmark('t1', '$.b')).toBe(false);
    expect(bookmarksOf('t1')).toEqual([]);
    addBookmark('t3', '$.x');
    dropBookmarks('t3');
    expect(bookmarksOf('t3')).toEqual([]);
  });
  it('caps the number of bookmarks', () => {
    for (let i = 0; i < MAX_BOOKMARKS + 5; i++) addBookmark('cap', `$.k${i}`);
    expect(bookmarksOf('cap')).toHaveLength(MAX_BOOKMARKS);
    expect(bookmarksOf('cap').at(-1)?.path).toBe(`$.k${MAX_BOOKMARKS + 4}`);
  });
});

describe('snapshots (versions)', () => {
  it('stores versions newest first, skips duplicates and empty text', async () => {
    expect(await addSnapshot('s1', '   ', 'blank')).toBe(false);
    expect(await addSnapshot('s1', '{"a":1}', 'one')).toBe(true);
    expect(await addSnapshot('s1', '{"a":1}', 'same')).toBe(false);
    expect(await addSnapshot('s1', '{"a":2}', 'two')).toBe(true);
    expect(snapshotsOf('s1').map((s) => s.label)).toEqual(['two', 'one']);
    expect(snapshotsOf('other')).toEqual([]);
  });
  it('keeps at most MAX_SNAPSHOTS and can remove / drop', async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 4; i++) await addSnapshot('s2', `{"i":${i}}`, `v${i}`);
    expect(snapshotsOf('s2')).toHaveLength(MAX_SNAPSHOTS);
    expect(snapshotsOf('s2')[0]?.label).toBe(`v${MAX_SNAPSHOTS + 3}`);
    const first = snapshotsOf('s2')[0]!;
    await removeSnapshot('s2', first.id);
    expect(snapshotsOf('s2')).toHaveLength(MAX_SNAPSHOTS - 1);
    expect((await loadSnapshots('s2')).length).toBe(MAX_SNAPSHOTS - 1);
    await dropSnapshots('s2');
    expect(snapshotsOf('s2')).toEqual([]);
  });
});

describe('jobs', () => {
  it('lists running jobs and can cancel them', async () => {
    const cancel = vi.fn();
    let release!: () => void;
    const p = runJob('work', cancel, () => new Promise<string>((r) => (release = () => r('done'))));
    expect(jobs().map((j) => j.label)).toEqual(['work']);
    cancelJob(jobs()[0]!.id);
    expect(cancel).toHaveBeenCalled();
    release();
    expect(await p).toBe('done');
    expect(jobs()).toEqual([]);
  });
  it('removes the job when the work fails', async () => {
    await expect(
      runJob(
        'x',
        () => undefined,
        async () => Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom');
    expect(jobs()).toEqual([]);
  });
});

describe('tabs', () => {
  it('opens, titles, renames, switches and closes documents', async () => {
    const first = activeTabId();
    const id = newTab('{"alpha":1,"beta":2}')!;
    expect(activeTabId()).toBe(id);
    await activeStore().parseNow();
    expect(autoTitle(activeStore())).toBe('{alpha, beta}');
    renameTab(id, 'Config');
    expect(tabs().find((t) => t.id === id)?.title).toBe('Config');
    activateTab(first);
    expect(activeTabId()).toBe(first);
    expect(storeFor(id).doc.text).toBe('{"alpha":1,"beta":2}');
    closeTab(id);
    expect(tabs().some((t) => t.id === id)).toBe(false);
    expect(JSON.parse(localStorage.getItem('jv.tabs.v1') ?? '{}').tabs).toBeTruthy();
  });
  it('limits the number of tabs and always keeps one', () => {
    const made: string[] = [];
    for (let i = 0; i < MAX_TABS + 2; i++) {
      const id = newTab();
      if (id) made.push(id);
    }
    expect(tabs().length).toBe(MAX_TABS);
    expect(newTab()).toBeNull();
    for (const t of [...tabs()]) closeTab(t.id);
    expect(tabs().length).toBe(1);
  });
  it('auto titles arrays and scalars', async () => {
    const a = createDocument({ initialText: '[1,2,3]', persist: false });
    await a.parseNow();
    expect(autoTitle(a)).toBe('Array[3]');
    const b = createDocument({ initialText: '5', persist: false });
    await b.parseNow();
    expect(autoTitle(b)).toBe('Value');
    expect(autoTitle(createDocument({ persist: false }))).toBe('');
  });
});

describe('document: focus branch and lenient', () => {
  it('focuses a subtree and exits', async () => {
    const d = createDocument({ initialText: '{"a":{"b":[1,2]},"c":3}', persist: false });
    await d.parseNow();
    d.setFocus(1);
    expect(d.getFocus()).toBe(1);
    expect(d.getRows()!.root).toBe(1);
    expect(Array.from(d.getRows()!.rows.subarray(0, d.getRows()!.length))).toEqual([1, 2]);
    d.setFocus(5); // a primitive cannot be focused
    expect(d.getFocus()).toBe(-1);
    d.setFocus(-1);
    expect(d.getRows()!.root).toBe(0);
  });
  it('flags JSON5 documents and converts them', async () => {
    const d = createDocument({ initialText: "{a: 1, // c\n b: 'x',}", persist: false });
    await d.parseNow();
    expect(d.doc.status).toBe('ok');
    expect(d.doc.lenient).toBe(true);
    expect(d.doc.strictError?.message).toContain('property name');
    const r = await d.transform('strict');
    expect(r.ok).toBe(true);
    expect(JSON.parse(d.doc.text)).toEqual({ a: 1, b: 'x' });
    await d.parseNow();
    expect(d.doc.lenient).toBe(false);
  });
  it('formatting JSON5 produces strict JSON', async () => {
    const d = createDocument({ initialText: '[1, 2, /* x */ 3,]', persist: false });
    await d.parseNow();
    await d.transform('format');
    expect(JSON.parse(d.doc.text)).toEqual([1, 2, 3]);
  });
  it('ensureParsed only re-parses when the text changed', async () => {
    const d = createDocument({ initialText: '[1]', persist: false });
    await d.ensureParsed();
    expect(d.doc.status).toBe('ok');
    d.setText('[1,2]', { fromUser: true });
    await d.ensureParsed();
    expect(d.getModel()?.count).toBe(3);
  });
  it('snapshots the text before transforms and loads', async () => {
    const d = createDocument({ initialText: '{"b":1,"a":2}', persist: false, id: 'snap-doc' });
    await d.parseNow();
    await d.transform('sort');
    await vi.waitFor(() => expect(snapshotsOf('snap-doc').length).toBe(1));
    expect(snapshotsOf('snap-doc')[0]?.text).toBe('{"b":1,"a":2}');
  });
});

describe('feature switches', () => {
  it('are all on by default and can be switched off one by one', async () => {
    const { FEATURE_IDS, featureOn, updateSettings, resetSettings } = await import('./settings');
    resetSettings();
    expect(FEATURE_IDS.every((id) => featureOn(id))).toBe(true);
    updateSettings({ features: { redact: false } });
    expect(featureOn('redact')).toBe(false);
    expect(featureOn('query')).toBe(true);
    updateSettings({ features: {} });
    expect(featureOn('redact')).toBe(true);
  });
  it('versions are not recorded while the Versions feature is off', async () => {
    const { updateSettings, resetSettings } = await import('./settings');
    updateSettings({ features: { versions: false } });
    const d = createDocument({ initialText: '{"b":1,"a":2}', persist: false, id: 'off-doc' });
    await d.parseNow();
    await d.transform('sort');
    expect(snapshotsOf('off-doc')).toEqual([]);
    resetSettings();
  });
});
