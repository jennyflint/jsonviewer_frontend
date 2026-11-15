import { createSignal } from 'solid-js';
import { getJSON, setJSON } from '../lib/storage';

export interface LocalShare {
  slug: string;
  title: string | null;
  created_at: string;
  expires_at: string | null;
  delete_token: string;
}

const KEY = 'jv.shares.v1';

function prune(list: LocalShare[]): LocalShare[] {
  const now = Date.now();
  return list.filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now);
}

const [shares, setShares] = createSignal<LocalShare[]>(prune(getJSON<LocalShare[]>(KEY, [])));
export { shares as localShares };

function persist(list: LocalShare[]): void {
  setShares(list);
  setJSON(KEY, list);
}

export function addLocalShare(s: LocalShare): void {
  persist(prune([s, ...shares().filter((x) => x.slug !== s.slug)]).slice(0, 100));
}

export function removeLocalShare(slug: string): void {
  persist(shares().filter((s) => s.slug !== slug));
}

export function deleteTokenFor(slug: string): string | undefined {
  return shares().find((s) => s.slug === slug)?.delete_token;
}
