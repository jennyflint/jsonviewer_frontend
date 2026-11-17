import { createSignal } from 'solid-js';
import { kvDelete, kvGet, kvSet } from '../lib/draft';

/** Local version history of a document (per tab): lets the user compare "before" and "after". */
export interface Snapshot {
  id: string;
  ts: number;
  label: string;
  text: string;
}

export const MAX_SNAPSHOTS = 15;
export const MAX_TOTAL_CHARS = 40 * 1024 * 1024;
const cache = new Map<string, Snapshot[]>();
const [revision, bump] = createSignal(0);

const key = (tabId: string) => `snap:${tabId}`;

/** Versions bigger than this live only in memory (cloning them into IndexedDB would block the main thread). */
export const MAX_PERSISTED_CHARS = 3 * 1024 * 1024;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Write to IndexedDB a moment later, off the interactive path (Format etc.), and only the small versions. */
function persistSoon(tabId: string): void {
  clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      void kvSet(
        key(tabId),
        (cache.get(tabId) ?? []).filter((s) => s.text.length <= MAX_PERSISTED_CHARS),
      );
    }, 1500),
  );
}

export async function loadSnapshots(tabId: string): Promise<Snapshot[]> {
  if (!cache.has(tabId)) cache.set(tabId, (await kvGet<Snapshot[]>(key(tabId))) ?? []);
  bump((v) => v + 1);
  return cache.get(tabId) as Snapshot[];
}

/** Newest first. Reactive on additions / removals. */
export function snapshotsOf(tabId: string): Snapshot[] {
  revision();
  return cache.get(tabId) ?? [];
}

export async function addSnapshot(tabId: string, text: string, label: string): Promise<boolean> {
  if (!text.trim()) return false;
  const list = [...(await loadSnapshots(tabId))];
  if (list[0]?.text === text) return false; // nothing changed since the last snapshot
  list.unshift({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    label,
    text,
  });
  let total = 0;
  const kept = list.slice(0, MAX_SNAPSHOTS).filter((s, i) => {
    total += s.text.length;
    return i === 0 || total <= MAX_TOTAL_CHARS;
  });
  cache.set(tabId, kept);
  bump((v) => v + 1);
  persistSoon(tabId);
  return true;
}

export async function removeSnapshot(tabId: string, id: string): Promise<void> {
  const kept = (await loadSnapshots(tabId)).filter((s) => s.id !== id);
  cache.set(tabId, kept);
  bump((v) => v + 1);
  persistSoon(tabId);
}

export async function dropSnapshots(tabId: string): Promise<void> {
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  cache.delete(tabId);
  bump((v) => v + 1);
  await kvDelete(key(tabId));
}
