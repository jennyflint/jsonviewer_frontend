import { createSignal } from 'solid-js';
import { api } from '../lib/api/endpoints';
import type { HistorySource } from '../lib/api/endpoints';
import { MAX_DOCUMENT_BYTES, utf8Size } from '../lib/files';
import { auth } from './auth';
import { settings } from './settings';

const MIN_INTERVAL_MS = 5000;
const last = new Map<string, number>(); // content fingerprint -> last save time
export const [lastSavedAt, setLastSavedAt] = createSignal<number | null>(null);

function fingerprint(content: string, source: string): string {
  return `${source}:${content.length}:${content.slice(0, 64)}:${content.slice(-64)}`;
}

/**
 * Autosave to history. Only for signed-in users with the setting on; never more often than
 * once per 5 s for identical content (the backend also deduplicates by content hash).
 */
export async function autosaveToHistory(
  content: string,
  source: HistorySource,
  sourceUrl?: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  if (auth.status !== 'authenticated') return false;
  if (!opts.force && !settings.saveToHistory) return false;
  if (!content.trim() || utf8Size(content) > MAX_DOCUMENT_BYTES) return false;
  const fp = fingerprint(content, source);
  const now = Date.now();
  if (now - (last.get(fp) ?? 0) < MIN_INTERVAL_MS) return false;
  last.set(fp, now);
  try {
    await api.saveHistory({ content, source, source_url: sourceUrl });
    setLastSavedAt(now);
    setTimeout(() => setLastSavedAt((v) => (v === now ? null : v)), 4000);
    return true;
  } catch {
    return false;
  }
}
