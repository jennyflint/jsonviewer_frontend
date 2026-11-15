import { vi } from 'vitest';
import { duplicateKeyNodes } from '../lib/json/access';
import { analyzeModel } from '../lib/json/duplicates';
import { minify, pretty, sortKeys } from '../lib/json/format';
import { parseJson } from '../lib/json/parser';
import { normalizeSide, structuralDiff } from '../lib/json/diff';
import type { DiffOptions } from '../lib/json/diff';
import { diffLines } from 'diff';
import { searchModel } from '../lib/json/search';

/** In-process stand-in for the Comlink workers (jsdom has no Worker). */
let cachedText = '';
const api = {
  parse(text: string) {
    cachedText = text;
    const r = parseJson(text);
    const stats = { nodes: 0, depth: 0, bytes: text.length, ms: 0 };
    if (!r.ok) return { ok: false as const, error: r.error, stats };
    return {
      ok: true as const,
      model: r.model,
      dupNodes: Int32Array.from(duplicateKeyNodes(r.model)),
      stats: { ...stats, nodes: r.model.count, depth: r.model.maxDepth },
    };
  },
  format: (text: string, i: 2 | 4 | '\t') => {
    const r = parseJson(text);
    return r.ok ? { ok: true as const, text: pretty(r.model, i) } : { ok: false as const, error: r.error };
  },
  minify: (text: string) => {
    const r = parseJson(text);
    return r.ok ? { ok: true as const, text: minify(r.model) } : { ok: false as const, error: r.error };
  },
  sortKeys: (text: string, i: 2 | 4 | '\t') => {
    const r = parseJson(text);
    return r.ok ? { ok: true as const, text: sortKeys(r.model, i) } : { ok: false as const, error: r.error };
  },
  search(q: string, o: import('../lib/json/search').SearchOptions) {
    const r = parseJson(cachedText);
    return r.ok ? searchModel(r.model, q, o) : { ok: true as const, ids: new Int32Array(0) };
  },
  duplicates(text: string, options: object) {
    const r = parseJson(text);
    return r.ok
      ? { ok: true as const, result: analyzeModel(r.model, options) }
      : { ok: false as const, code: 'x', message: 'x' };
  },
};

const diffApi = {
  compare(left: string, right: string, opts: DiffOptions, allowRaw = false) {
    const l = parseJson(left);
    const r = parseJson(right);
    const errors = [
      ...(l.ok ? [] : [{ side: 'left' as const, error: l.error }]),
      ...(r.ok ? [] : [{ side: 'right' as const, error: r.error }]),
    ];
    const count = (a: string, b: string) => {
      let additions = 0;
      let deletions = 0;
      for (const p of diffLines(a, b))
        p.added ? (additions += p.count ?? 0) : p.removed ? (deletions += p.count ?? 0) : 0;
      return { additions, deletions };
    };
    if (!l.ok || !r.ok) {
      const lt = allowRaw ? left : '';
      const rt = allowRaw ? right : '';
      return {
        leftNormalized: lt,
        rightNormalized: rt,
        changes: [],
        errors,
        raw: allowRaw,
        stats: { added: 0, removed: 0, changed: 0, ...count(lt, rt) },
      };
    }
    const ln = normalizeSide(l.model, opts);
    const rn = normalizeSide(r.model, opts);
    const changes = structuralDiff(l.model, r.model, opts, ln.lines, rn.lines);
    return {
      leftNormalized: ln.text,
      rightNormalized: rn.text,
      changes,
      errors: [],
      raw: false,
      stats: {
        added: changes.filter((c) => c.kind === 'added').length,
        removed: changes.filter((c) => c.kind === 'removed').length,
        changed: changes.filter((c) => c.kind !== 'added' && c.kind !== 'removed').length,
        ...count(ln.text, rn.text),
      },
    };
  },
};

vi.mock('../lib/workers/clients', () => ({
  jsonWorker: {
    call: async (fn: (a: typeof api) => unknown) => fn(api),
    once: async (fn: (a: typeof api) => unknown) => fn(api),
  },
  diffWorker: {
    call: async (fn: (a: typeof diffApi) => unknown) => fn(diffApi),
    once: async (fn: (a: typeof diffApi) => unknown) => fn(diffApi),
  },
  isStale: () => false,
  StaleError: class extends Error {},
}));
