import { decodeToken, keyOf, raw } from './access';
import { T_ARRAY, T_OBJECT, T_STRING } from './parser';
import type { JsonModel } from './parser';

export interface SearchOptions {
  keys: boolean;
  values: boolean;
  caseSensitive: boolean;
  regex: boolean;
}

export const DEFAULT_SEARCH: SearchOptions = { keys: true, values: true, caseSensitive: false, regex: false };

export type SearchResult = { ok: true; ids: Int32Array } | { ok: false; error: string };

export const MAX_MATCHES = 100_000;

export function searchModel(m: JsonModel, query: string, o: SearchOptions): SearchResult {
  if (!query) return { ok: true, ids: new Int32Array(0) };
  let test: (s: string) => boolean;
  if (o.regex) {
    let re: RegExp;
    try {
      re = new RegExp(query, o.caseSensitive ? '' : 'i');
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid regular expression' };
    }
    test = (s) => re.test(s);
  } else if (o.caseSensitive) test = (s) => s.includes(query);
  else {
    const q = query.toLowerCase();
    test = (s) => s.toLowerCase().includes(q);
  }
  const out: number[] = [];
  for (let id = 0; id < m.count && out.length < MAX_MATCHES; id++) {
    if (o.keys && (m.keyStart[id] as number) >= 0 && test(keyOf(m, id) as string)) {
      out.push(id);
      continue;
    }
    const t = m.type[id] as number;
    if (o.values && t !== T_OBJECT && t !== T_ARRAY) {
      const s = t === T_STRING ? decodeToken(raw(m, id)) : raw(m, id);
      if (test(s)) out.push(id);
    }
  }
  return { ok: true, ids: Int32Array.from(out) };
}
