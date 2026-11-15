import { api } from '../lib/api/endpoints';
import type { FetchResponse } from '../lib/api/endpoints';
import { getJSON, setJSON } from '../lib/storage';
import { confirmAction } from './confirm';
import { loadDocument, needsReplaceConfirm } from './document';
import { autosaveToHistory } from './historySync';
import { toast } from './toasts';
import { t } from '../lib/i18n';

const RECENT_KEY = 'jv.recentUrls.v1';
export const MAX_RECENT = 10;

export function recentUrls(): string[] {
  return getJSON<string[]>(RECENT_KEY, []);
}

export function rememberUrl(url: string): void {
  setJSON(RECENT_KEY, [url, ...recentUrls().filter((u) => u !== url)].slice(0, MAX_RECENT));
}

export function validateHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Fetch through the backend proxy and load into the main document.
 * Resolves to the response, or null when the user declined to replace a dirty document.
 * Throws ApiError on failure.
 */
export async function fetchAndLoad(url: string, signal?: AbortSignal): Promise<FetchResponse | null> {
  const res = await api.fetchUrl(url, signal);
  if (needsReplaceConfirm()) {
    const ok = await confirmAction({
      title: t('url.replace_title'),
      message: t('url.replace_message'),
      confirmLabel: t('url.replace_confirm'),
      danger: true,
    });
    if (!ok) return null;
  }
  rememberUrl(url);
  loadDocument(res.content, 'url');
  if (res.final_url && res.final_url !== res.url) toast.info(t('url.redirected', { url: res.final_url }));
  if (!res.is_valid_json && res.parse_error) {
    toast.error(t('url.invalid_json', { message: res.parse_error.message }), {
      detail: t('status.line_col', { line: res.parse_error.line, col: res.parse_error.column }),
    });
  } else {
    toast.success(t('url.loaded'));
    void autosaveToHistory(res.content, 'url', url);
  }
  return res;
}
