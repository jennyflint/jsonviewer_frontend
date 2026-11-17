/** JSONPath / JMESPath queries. The engines are loaded on first use (they are only needed in the worker). */
import { childByIndex, childByKey } from './access';
import { buildPath } from './path';
import { T_ARRAY, T_OBJECT } from './parser';
import type { JsonModel } from './parser';

export type QueryLang = 'jsonpath' | 'jmespath';

export type QueryResult =
  | { ok: true; text: string; count: number; paths: string[]; truncated: boolean }
  | { ok: false; error: string };

export const MAX_RESULT_PATHS = 5000;

/** `/a/0/b` (RFC 6901) -> node id in the model (array indexes vs. numeric keys are told apart by the node type). */
export function resolvePointer(m: JsonModel, pointer: string): number {
  let cur = 0;
  if (pointer === '' || pointer === '/') return pointer === '' ? 0 : -1;
  for (const raw of pointer.slice(1).split('/')) {
    const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    const t = m.type[cur];
    if (t === T_ARRAY) cur = /^\d+$/.test(seg) ? childByIndex(m, cur, Number(seg)) : -1;
    else if (t === T_OBJECT) cur = childByKey(m, cur, seg);
    else return -1;
    if (cur < 0) return -1;
  }
  return cur;
}

export async function runQuery(
  m: JsonModel,
  data: unknown,
  lang: QueryLang,
  expr: string,
): Promise<QueryResult> {
  if (!expr.trim()) return { ok: true, text: '', count: 0, paths: [], truncated: false };
  try {
    if (lang === 'jmespath') {
      const jmespath = await import('jmespath');
      const result = (
        jmespath.search ?? (jmespath as unknown as { default: typeof jmespath }).default.search
      )(data as never, expr);
      const count = Array.isArray(result) ? result.length : result === null || result === undefined ? 0 : 1;
      return { ok: true, text: JSON.stringify(result ?? null, null, 2), count, paths: [], truncated: false };
    }
    const { JSONPath } = await import('jsonpath-plus');
    const hits = JSONPath({ path: expr, json: data as never, resultType: 'all', wrap: true }) as {
      value: unknown;
      pointer: string;
    }[];
    const paths: string[] = [];
    for (const h of hits.slice(0, MAX_RESULT_PATHS)) {
      const id = resolvePointer(m, h.pointer);
      if (id >= 0) paths.push(buildPath(m, id));
    }
    return {
      ok: true,
      text: JSON.stringify(
        hits.map((h) => h.value),
        null,
        2,
      ),
      count: hits.length,
      paths,
      truncated: hits.length > MAX_RESULT_PATHS,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
