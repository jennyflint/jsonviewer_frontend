import { createEffect, createRoot, createSignal } from 'solid-js';
import { createDocument } from './documentFactory';
import type { DocumentStore } from './documentFactory';
import { removeDraft } from '../lib/draft';
import { getJSON, setJSON } from '../lib/storage';
import { dropBookmarks } from './bookmarks';
import { featureOn } from './settings';
import { jsonWorker } from '../lib/workers/clients';
import { dropSnapshots } from './snapshots';
import { keyOf } from '../lib/json/access';
import { T_ARRAY, T_OBJECT } from '../lib/json/parser';

/** Several documents in one window. Each tab owns a full document store, draft and version history. */
export interface TabMeta {
  id: string;
  /** Custom or auto-derived title (empty = "Untitled N"). */
  title: string;
  custom?: boolean;
}

export const MAX_TABS = 12;
const KEY = 'jv.tabs.v1';

function load(): { tabs: TabMeta[]; active: string } {
  const saved = getJSON<{ tabs?: TabMeta[]; active?: string } | null>(KEY, null);
  const tabs = (saved?.tabs ?? []).filter((t) => t && typeof t.id === 'string').slice(0, MAX_TABS);
  if (!tabs.length) return { tabs: [{ id: 'main', title: '' }], active: 'main' };
  return {
    tabs,
    active: tabs.some((t) => t.id === saved?.active) ? (saved?.active as string) : (tabs[0] as TabMeta).id,
  };
}

const initial = load();
const [tabs, setTabs] = createSignal<TabMeta[]>(initial.tabs);
const [activeTabId, setActiveTabId] = createSignal(initial.active);
export { tabs, activeTabId };

const stores = new Map<string, DocumentStore>();

export function storeFor(id: string): DocumentStore {
  let s = stores.get(id);
  if (!s) {
    s = createDocument({ persist: true, id });
    stores.set(id, s);
  }
  return s;
}

export const activeStore = (): DocumentStore => storeFor(activeTabId());

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Open a new empty tab (optionally with content). Returns its id, or null when the tab limit is reached. */
export function newTab(text = '', title = ''): string | null {
  if (tabs().length >= MAX_TABS) return null;
  const id = newId();
  setTabs([...tabs(), { id, title, custom: !!title }]);
  setActiveTabId(id);
  if (text) storeFor(id).loadDocument(text, 'draft');
  return id;
}

export function activateTab(id: string): void {
  if (tabs().some((t) => t.id === id)) setActiveTabId(id);
}

export function renameTab(id: string, title: string): void {
  const t = title.trim();
  setTabs(tabs().map((x) => (x.id === id ? { ...x, title: t, custom: !!t } : x)));
}

export function closeTab(id: string): void {
  const list = tabs();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return;
  stores.delete(id);
  void removeDraft(id);
  void dropSnapshots(id);
  dropBookmarks(id);
  let next = list.filter((t) => t.id !== id);
  if (!next.length) {
    const fresh = newId();
    next = [{ id: fresh, title: '' }];
  }
  setTabs(next);
  if (activeTabId() === id) setActiveTabId((next[Math.min(idx, next.length - 1)] as TabMeta).id);
}

/** A short title from the document's content: `{id, name…}` / `Array[12]`. */
export function autoTitle(store: DocumentStore): string {
  const m = store.getModel();
  if (!m || m.count === 0) return '';
  if (m.type[0] === T_OBJECT) {
    const keys: string[] = [];
    for (let c = m.firstChild[0] as number; c >= 0 && keys.length < 3; c = m.nextSibling[c] as number)
      keys.push(keyOf(m, c) as string);
    return `{${keys.join(', ')}${(m.childCount[0] as number) > 3 ? '…' : ''}}`;
  }
  if (m.type[0] === T_ARRAY) return `Array[${m.childCount[0]}]`;
  return 'Value';
}

let json5Seen: boolean | null = null;

createRoot(() => {
  createEffect(() => {
    const on = featureOn('json5');
    if (json5Seen !== null && json5Seen !== on) {
      void jsonWorker.once((w) => w.configure({ lenient: on })).then(() => activeStore().parseNow());
    }
    json5Seen = on;
  });
  createEffect(() => setJSON(KEY, { tabs: tabs(), active: activeTabId() }));
  createEffect(() => {
    const id = activeTabId();
    const store = storeFor(id);
    store.getModel(); // re-run after each successful parse
    const title = autoTitle(store);
    const cur = tabs().find((t) => t.id === id);
    if (cur && !cur.custom && cur.title !== title)
      setTabs(tabs().map((x) => (x.id === id ? { ...x, title } : x)));
  });
});
