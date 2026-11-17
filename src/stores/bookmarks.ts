import { createSignal } from 'solid-js';
import { getJSON, setJSON } from '../lib/storage';

/** Bookmarked nodes, per document tab. They are stored as JSON paths, so they survive edits and reloads. */
export interface Bookmark {
  path: string;
  label: string;
}

const KEY = 'jv.bookmarks.v1';
export const MAX_BOOKMARKS = 100;
const [all, setAll] = createSignal<Record<string, Bookmark[]>>(getJSON<Record<string, Bookmark[]>>(KEY, {}));

function save(next: Record<string, Bookmark[]>): void {
  setAll(next);
  setJSON(KEY, next);
}

export const bookmarksOf = (tabId: string): Bookmark[] => all()[tabId] ?? [];
export const isBookmarked = (tabId: string, path: string): boolean =>
  bookmarksOf(tabId).some((b) => b.path === path);

export function addBookmark(tabId: string, path: string, label?: string): void {
  if (isBookmarked(tabId, path)) return;
  save({ ...all(), [tabId]: [...bookmarksOf(tabId), { path, label: label ?? path }].slice(-MAX_BOOKMARKS) });
}

export function removeBookmark(tabId: string, path: string): void {
  save({ ...all(), [tabId]: bookmarksOf(tabId).filter((b) => b.path !== path) });
}

export function toggleBookmark(tabId: string, path: string): boolean {
  if (isBookmarked(tabId, path)) {
    removeBookmark(tabId, path);
    return false;
  }
  addBookmark(tabId, path);
  return true;
}

export function renameBookmark(tabId: string, path: string, label: string): void {
  save({
    ...all(),
    [tabId]: bookmarksOf(tabId).map((b) => (b.path === path ? { ...b, label: label.trim() || path } : b)),
  });
}

export function dropBookmarks(tabId: string): void {
  const { [tabId]: _removed, ...rest } = all();
  save(rest);
}
