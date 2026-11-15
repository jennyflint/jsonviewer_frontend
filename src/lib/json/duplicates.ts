/**
 * Duplicate analysis. The output uses exactly the schema of the backend's
 * `POST /api/analysis/duplicates` response (types come from the generated API schema).
 */
import type { components } from '../api/schema';
import { children, childByIndex, childByKey, keyOf, nodePosition, raw, stringValue } from './access';
import { canonicalNumber, canonicalize, compareCodePoints, effectiveMembers } from './canonical';
import { buildPath, parsePath } from './path';
import { T_ARRAY, T_FALSE, T_NULL, T_NUMBER, T_OBJECT, T_STRING, T_TRUE, parseJson } from './parser';
import type { JsonModel } from './parser';

export type DuplicatesResponse = components['schemas']['DuplicatesResponse'];
export type DuplicateOptions = components['schemas']['DuplicateOptions'];
export type DuplicateKey = components['schemas']['DuplicateKey'];
export type DuplicateValue = components['schemas']['DuplicateValue'];
export type DuplicateSubtree = components['schemas']['DuplicateSubtree'];
export type DuplicatesByField = components['schemas']['DuplicatesByField'];

export const MAX_PATHS_PER_GROUP = 1000;
const PREVIEW_CHARS = 100;

export const DEFAULT_OPTIONS = {
  keys: true,
  values: true,
  subtrees: true,
  min_occurrences: 2,
  min_string_length: 1,
  value_types: ['string', 'number', 'boolean', 'null'],
  min_subtree_size: 2,
  max_groups: 500,
} as const satisfies Partial<DuplicateOptions>;

export class AnalysisError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function fnv(str: string, h: number): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mix(h: number, x: number): number {
  h = Math.imul(h ^ x, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Bottom-up structural hash (two independent 32-bit lanes = 64 bits). */
function structuralHashes(m: JsonModel): { h1: Uint32Array; h2: Uint32Array } {
  const h1 = new Uint32Array(m.count);
  const h2 = new Uint32Array(m.count);
  for (let id = m.count - 1; id >= 0; id--) {
    const t = m.type[id] as number;
    let a = 0x811c9dc5 ^ t;
    let b = 0x9747b28c + t;
    if (t === T_OBJECT) {
      for (const mem of effectiveMembers(m, id)) {
        const kh = fnv(mem.key, 0x811c9dc5);
        a = mix(mix(a, kh), h1[mem.id] as number);
        b = mix(mix(b, fnv(mem.key, 0x01234567)), h2[mem.id] as number);
      }
    } else if (t === T_ARRAY) {
      for (let c = m.firstChild[id] as number; c >= 0; c = m.nextSibling[c] as number) {
        a = mix(a, h1[c] as number);
        b = mix(b, h2[c] as number);
      }
    } else {
      const s = t === T_STRING ? stringValue(m, id) : t === T_NUMBER ? canonicalNumber(raw(m, id)) : '';
      a = fnv(s, a);
      b = fnv(s, b ^ 0x5bd1e995);
    }
    h1[id] = a;
    h2[id] = b;
  }
  return { h1, h2 };
}

const hex8 = (n: number) => n.toString(16).padStart(8, '0');

/** Members that are overridden by a later member with the same key (not the effective value). */
function shadowedMembers(m: JsonModel): Set<number> {
  const out = new Set<number>();
  for (let id = 0; id < m.count; id++) {
    if (m.type[id] !== T_OBJECT || (m.childCount[id] as number) < 2) continue;
    const last = new Map<string, number>();
    const all: [string, number][] = [];
    for (let c = m.firstChild[id] as number; c >= 0; c = m.nextSibling[c] as number) {
      const k = keyOf(m, c) as string;
      last.set(k, c);
      all.push([k, c]);
    }
    if (last.size === all.length) continue;
    for (const [k, c] of all) if (last.get(k) !== c) out.add(c);
  }
  return out;
}

function duplicateKeys(m: JsonModel): DuplicateKey[] {
  const out: DuplicateKey[] = [];
  // Objects are reported in the order they are closed (inner before outer), like the backend's parser.
  const objects: number[] = [];
  for (let id = 0; id < m.count; id++)
    if (m.type[id] === T_OBJECT && (m.childCount[id] as number) >= 2) objects.push(id);
  objects.sort((a, b) => (m.end[a] as number) - (m.end[b] as number));
  for (const id of objects) {
    const by = new Map<string, number[]>();
    for (let c = m.firstChild[id] as number; c >= 0; c = m.nextSibling[c] as number) {
      const k = keyOf(m, c) as string;
      const l = by.get(k);
      if (l) l.push(c);
      else by.set(k, [c]);
    }
    let objPath: string | undefined;
    for (const [key, members] of by) {
      if (members.length < 2) continue;
      objPath ??= buildPath(m, id);
      out.push({
        object_path: objPath,
        key,
        occurrences: members.map((c) => {
          const pos = nodePosition(m, c, true);
          const r = raw(m, c);
          return {
            line: pos.line,
            column: pos.column,
            offset: pos.offset,
            value_preview: r.length <= 80 ? r : r.slice(0, 80) + '…',
          };
        }),
      });
    }
  }
  return out.sort((a, b) => b.occurrences.length - a.occurrences.length);
}

interface Walk {
  strs: Map<string, number[]>;
  nums: Map<string, { ids: number[]; lex: Map<string, number> }>;
  bools: Map<boolean, number[]>;
  nulls: number[];
  conts: number[];
  size: Int32Array;
}

function walk(
  m: JsonModel,
  shadow: Set<number>,
  wantValues: boolean,
  types: Set<string>,
  minLen: number,
): Walk {
  const w: Walk = {
    strs: new Map(),
    nums: new Map(),
    bools: new Map(),
    nulls: [],
    conts: [],
    size: new Int32Array(m.count),
  };
  w.size.fill(1);
  for (let id = m.count - 1; id > 0; id--) {
    if (!shadow.has(id)) w.size[m.parent[id] as number]! += w.size[id] as number;
  }
  let id = 0;
  while (id < m.count) {
    if (shadow.has(id)) {
      id = m.subtreeEnd[id] as number;
      continue;
    }
    const t = m.type[id] as number;
    if (t === T_OBJECT || t === T_ARRAY) w.conts.push(id);
    else if (wantValues) {
      if (t === T_STRING) {
        if (types.has('string')) {
          const s = stringValue(m, id);
          if (s.length >= minLen) {
            const l = w.strs.get(s);
            if (l) l.push(id);
            else w.strs.set(s, [id]);
          }
        }
      } else if (t === T_NUMBER) {
        if (types.has('number')) {
          const r = raw(m, id);
          const k = canonicalNumber(r);
          let e = w.nums.get(k);
          if (!e) w.nums.set(k, (e = { ids: [], lex: new Map() }));
          e.ids.push(id);
          e.lex.set(r, (e.lex.get(r) ?? 0) + 1);
        }
      } else if (t === T_TRUE || t === T_FALSE) {
        if (types.has('boolean')) {
          const l = w.bools.get(t === T_TRUE);
          if (l) l.push(id);
          else w.bools.set(t === T_TRUE, [id]);
        }
      } else if (t === T_NULL && types.has('null')) w.nulls.push(id);
    }
    id++;
  }
  return w;
}

const paths = (m: JsonModel, ids: number[]) => ids.slice(0, MAX_PATHS_PER_GROUP).map((i) => buildPath(m, i));

function numberValue(canon: string): number | string {
  const n = Number(canon);
  return Number.isFinite(n) && (!Number.isInteger(n) || Number.isSafeInteger(n)) ? n : canon;
}

function valueGroups(
  m: JsonModel,
  w: Walk,
  o: Required<Pick<DuplicateOptions, 'min_occurrences' | 'max_groups'>>,
) {
  const n = o.min_occurrences;
  const groups: DuplicateValue[] = [];
  for (const [s, ids] of w.strs)
    if (ids.length >= n) groups.push({ type: 'string', value: s, count: ids.length, paths: paths(m, ids) });
  for (const [canon, e] of w.nums) {
    if (e.ids.length >= n)
      groups.push({
        type: 'number',
        value: numberValue(canon),
        count: e.ids.length,
        paths: paths(m, e.ids),
        lexemes: [...e.lex.keys()],
      });
  }
  for (const [b, ids] of w.bools)
    if (ids.length >= n) groups.push({ type: 'boolean', value: b, count: ids.length, paths: paths(m, ids) });
  if (w.nulls.length >= n)
    groups.push({ type: 'null', value: null, count: w.nulls.length, paths: paths(m, w.nulls) });
  groups.sort((a, b) => b.count - a.count);
  return { groups: groups.slice(0, o.max_groups), cut: groups.length > o.max_groups };
}

function subtreeGroups(m: JsonModel, w: Walk, o: Required<DuplicateOptions>) {
  const { h1, h2 } = structuralHashes(m);
  const buckets = new Map<string, number[]>();
  for (const id of w.conts) {
    if ((w.size[id] as number) < o.min_subtree_size) continue;
    const key = hex8(h1[id] as number) + hex8(h2[id] as number);
    const l = buckets.get(key);
    if (l) l.push(id);
    else buckets.set(key, [id]);
  }
  // verify candidate groups by comparing canonical strings (guards against hash collisions)
  interface Group {
    hash: string;
    ids: number[];
    canon: string;
  }
  const groups: Group[] = [];
  for (const [hash, ids] of buckets) {
    if (ids.length < o.min_occurrences) continue;
    const bySig = new Map<string, number[]>();
    for (const id of ids) {
      const c = canonicalize(m, id);
      const l = bySig.get(c);
      if (l) l.push(id);
      else bySig.set(c, [id]);
    }
    for (const [canon, gids] of bySig)
      if (gids.length >= o.min_occurrences) groups.push({ hash, ids: gids, canon });
  }
  const groupOf = new Map<number, number>();
  groups.forEach((g, gi) => g.ids.forEach((id) => groupOf.set(id, gi)));

  const out: DuplicateSubtree[] = [];
  for (const g of groups) {
    const positions = new Set<string>();
    let uncovered = 0;
    for (const id of g.ids) {
      const rel: string[] = [];
      let cur = id;
      let anc = -1;
      for (;;) {
        const p = m.parent[cur] as number;
        if (p < 0) break;
        rel.push(m.type[p] === T_ARRAY ? String(m.ord[cur]) : 'k' + (keyOf(m, cur) as string));
        if (groupOf.has(p)) {
          anc = groupOf.get(p) as number;
          break;
        }
        cur = p;
      }
      if (anc < 0) uncovered++;
      else positions.add(anc + '|' + rel.join('\u0000'));
    }
    if (uncovered + positions.size < o.min_occurrences) continue;
    const first = g.ids[0] as number;
    out.push({
      hash: g.hash,
      kind: m.type[first] === T_OBJECT ? 'object' : 'array',
      size: w.size[first] as number,
      count: g.ids.length,
      preview: g.canon.length > PREVIEW_CHARS ? g.canon.slice(0, PREVIEW_CHARS) + '…' : g.canon,
      paths: paths(m, g.ids),
    });
  }
  out.sort((a, b) => b.count - a.count || b.size - a.size);
  return { groups: out.slice(0, o.max_groups), cut: out.length > o.max_groups };
}

function byField(m: JsonModel, o: Required<DuplicateOptions>): { result: DuplicatesByField; cut: boolean } {
  const bf = o.by_field as NonNullable<DuplicateOptions['by_field']>;
  const segs = parsePath(bf.array_path);
  if (!segs)
    throw new AnalysisError(
      'invalid_array_path',
      bf.array_path.startsWith('$') ? 'Invalid array_path syntax.' : "array_path must start with '$'.",
    );
  let cur = 0;
  for (const seg of segs) {
    const t = m.type[cur];
    const next =
      typeof seg === 'number'
        ? t === T_ARRAY
          ? childByIndex(m, cur, seg)
          : -1
        : t === T_OBJECT
          ? childByKey(m, cur, seg)
          : -1;
    if (next < 0) throw new AnalysisError('invalid_array_path', 'array_path does not exist.');
    cur = next;
  }
  const els = children(m, cur);
  if (m.type[cur] !== T_ARRAY || els.some((e) => m.type[e] !== T_OBJECT)) {
    throw new AnalysisError('invalid_array_path', 'array_path must resolve to an array of objects.');
  }
  const groups = new Map<string, { value: unknown; indices: number[] }>();
  let missing = 0;
  els.forEach((el, idx) => {
    const f = childByKey(m, el, bf.field);
    if (f < 0) {
      missing++;
      return;
    }
    const t = m.type[f] as number;
    let tag: string;
    let value: unknown;
    if (t === T_STRING) {
      value = stringValue(m, f);
      tag = 's' + value;
    } else if (t === T_NUMBER) {
      const c = canonicalNumber(raw(m, f));
      value = numberValue(c);
      tag = '#' + c;
    } else if (t === T_TRUE || t === T_FALSE) {
      value = t === T_TRUE;
      tag = 'b' + value;
    } else if (t === T_NULL) {
      value = null;
      tag = 'n';
    } else {
      value = canonicalize(m, f);
      tag = 'c' + value;
    }
    const g = groups.get(tag);
    if (g) g.indices.push(idx);
    else groups.set(tag, { value, indices: [idx] });
  });
  const list = [...groups.values()]
    .filter((g) => g.indices.length >= o.min_occurrences)
    .sort((a, b) => b.indices.length - a.indices.length);
  return {
    result: { array_path: bf.array_path, field: bf.field, groups: list.slice(0, o.max_groups), missing },
    cut: list.length > o.max_groups,
  };
}

export function analyzeModel(m: JsonModel, options: Partial<DuplicateOptions> = {}): DuplicatesResponse {
  const started = performance.now();
  const o = { ...DEFAULT_OPTIONS, by_field: null, ...options } as Required<DuplicateOptions>;
  let truncated = false;
  const keys = o.keys ? duplicateKeys(m) : [];
  const dk = keys.length > o.max_groups ? keys.slice(0, o.max_groups) : keys;
  if (keys.length > o.max_groups) truncated = true;
  let values: DuplicateValue[] = [];
  let subtrees: DuplicateSubtree[] = [];
  if (o.values || o.subtrees) {
    const shadow = shadowedMembers(m);
    const w = walk(m, shadow, o.values, new Set(o.value_types), o.min_string_length);
    if (o.values) {
      const r = valueGroups(m, w, o);
      values = r.groups;
      truncated ||= r.cut;
    }
    if (o.subtrees) {
      const r = subtreeGroups(m, w, o);
      subtrees = r.groups;
      truncated ||= r.cut;
    }
  }
  let bf: DuplicatesByField | null = null;
  if (o.by_field) {
    const r = byField(m, o);
    bf = r.result;
    truncated ||= r.cut;
  }
  return {
    valid: true,
    parse_error: null,
    stats: { nodes: m.count, depth: m.maxDepth, elapsed_ms: Math.round(performance.now() - started) },
    duplicate_keys: dk,
    duplicate_values: values,
    duplicate_subtrees: subtrees,
    duplicates_by_field: bf,
    truncated,
  };
}

export function analyzeText(text: string, options: Partial<DuplicateOptions> = {}): DuplicatesResponse {
  const started = performance.now();
  const r = parseJson(text);
  if (!r.ok) {
    return {
      valid: false,
      parse_error: { message: r.error.message, line: r.error.line, column: r.error.column },
      stats: { nodes: 0, depth: 0, elapsed_ms: Math.round(performance.now() - started) },
      duplicate_keys: [],
      duplicate_values: [],
      duplicate_subtrees: [],
      duplicates_by_field: null,
      truncated: false,
    };
  }
  return analyzeModel(r.model, options);
}

/** Candidate array paths (arrays of objects) with the union of their element keys, for the By-field picker. */
export function arrayCandidates(m: JsonModel, limit = 50): { path: string; fields: string[] }[] {
  const out: { path: string; fields: string[] }[] = [];
  for (let id = 0; id < m.count && out.length < limit; id++) {
    if (m.type[id] !== T_ARRAY || (m.childCount[id] as number) < 2) continue;
    const els = children(m, id);
    if (!els.every((e) => m.type[e] === T_OBJECT)) continue;
    const fields = new Set<string>();
    for (const e of els.slice(0, 200)) for (const c of children(m, e)) fields.add(keyOf(m, c) as string);
    out.push({ path: buildPath(m, id), fields: [...fields].sort(compareCodePoints) });
  }
  return out;
}
