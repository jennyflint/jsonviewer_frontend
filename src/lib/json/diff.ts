/** Structural JSON diff between two parsed models. */
import { children, childByKey, raw, stringValue } from './access';
import { canonicalNumber, canonicalize, effectiveMembers } from './canonical';
import { normalize } from './format';
import type { ChildOrder, Indent } from './format';
import { buildPath } from './path';
import { T_ARRAY, T_FALSE, T_NULL, T_NUMBER, T_OBJECT, T_STRING, T_TRUE } from './parser';
import type { JsonModel } from './parser';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'type_changed' | 'moved';

export interface Change {
  kind: ChangeKind;
  path: string;
  oldValue?: string;
  newValue?: string;
  /** 1-based line in the normalized left / right text. */
  leftLine?: number;
  rightLine?: number;
}

export interface DiffOptions {
  ignoreKeyOrder: boolean;
  ignoreArrayOrder: boolean;
  /** Match objects inside arrays by the value of this field. */
  arrayMatchKey: string;
  /** Ignore whitespace in the text diff. */
  ignoreWhitespace: boolean;
  indent: Indent;
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  ignoreKeyOrder: true,
  ignoreArrayOrder: false,
  arrayMatchKey: '',
  ignoreWhitespace: false,
  indent: 2,
};

const category = (t: number): number => (t === T_TRUE || t === T_FALSE ? T_TRUE : t);

function primitiveKey(m: JsonModel, id: number): string {
  const t = m.type[id] as number;
  if (t === T_STRING) return 's' + stringValue(m, id);
  if (t === T_NUMBER) return '#' + canonicalNumber(raw(m, id));
  if (t === T_TRUE) return 'true';
  if (t === T_FALSE) return 'false';
  if (t === T_NULL) return 'null';
  return 'c' + canonicalize(m, id);
}

/** Short single-line preview of a value. */
export function valuePreview(m: JsonModel, id: number, max = 80): string {
  const s = m.start[id] as number;
  const e = Math.min(m.end[id] as number, s + max * 3);
  const r = m.text.slice(s, e).replace(/\s+/g, ' ');
  return r.length > max || e < (m.end[id] as number) ? r.slice(0, max) + '…' : r;
}

/** Indexes of a longest increasing subsequence (used to decide which matched items really moved). */
export function lisIndexes(a: number[]): Set<number> {
  const tails: number[] = [];
  const prev = new Array<number>(a.length).fill(-1);
  for (let i = 0; i < a.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((a[tails[mid] as number] as number) < (a[i] as number)) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1] as number;
    tails[lo] = i;
  }
  const out = new Set<number>();
  for (let k = tails.length ? (tails[tails.length - 1] as number) : -1; k >= 0; k = prev[k] as number)
    out.add(k);
  return out;
}

export interface StructuralResult {
  changes: Change[];
}

export function structuralDiff(
  l: JsonModel,
  r: JsonModel,
  opts: DiffOptions,
  lLines?: Int32Array,
  rLines?: Int32Array,
): Change[] {
  const changes: Change[] = [];
  const lineL = (id: number) => (lLines && id >= 0 ? lLines[id] : undefined);
  const lineR = (id: number) => (rLines && id >= 0 ? rLines[id] : undefined);

  const add = (rid: number) =>
    changes.push({
      kind: 'added',
      path: buildPath(r, rid),
      newValue: valuePreview(r, rid),
      rightLine: lineR(rid),
    });
  const remove = (lid: number) =>
    changes.push({
      kind: 'removed',
      path: buildPath(l, lid),
      oldValue: valuePreview(l, lid),
      leftLine: lineL(lid),
    });

  const visit = (lid: number, rid: number, moved = false): void => {
    const lt = l.type[lid] as number;
    const rt = r.type[rid] as number;
    const base = { path: buildPath(r, rid), leftLine: lineL(lid), rightLine: lineR(rid) };
    if (category(lt) !== category(rt)) {
      changes.push({
        kind: 'type_changed',
        ...base,
        oldValue: valuePreview(l, lid),
        newValue: valuePreview(r, rid),
      });
      return;
    }
    if (moved)
      changes.push({ kind: 'moved', ...base, oldValue: `#${l.ord[lid]}`, newValue: `#${r.ord[rid]}` });
    if (lt !== T_OBJECT && lt !== T_ARRAY) {
      if (primitiveKey(l, lid) !== primitiveKey(r, rid)) {
        changes.push({
          kind: 'changed',
          ...base,
          oldValue: valuePreview(l, lid),
          newValue: valuePreview(r, rid),
        });
      }
      return;
    }
    if (lt === T_OBJECT) {
      const lm = new Map(effectiveMembers(l, lid).map((x) => [x.key, x.id]));
      const rm = effectiveMembers(r, rid);
      const seen = new Set<string>();
      for (const { key, id } of rm) {
        seen.add(key);
        const lc = lm.get(key);
        if (lc === undefined) add(id);
        else visit(lc, id);
      }
      for (const [key, id] of lm) if (!seen.has(key)) remove(id);
      return;
    }
    diffArrays(lid, rid);
  };

  const diffArrays = (lid: number, rid: number): void => {
    const la = children(l, lid);
    const ra = children(r, rid);
    const mk = opts.arrayMatchKey.trim();
    if (mk) {
      const keyed = (m: JsonModel, ids: number[]) =>
        ids.every((c) => m.type[c] === T_OBJECT && childByKey(m, c, mk) >= 0);
      if (keyed(l, la) && keyed(r, ra)) {
        const sig = (m: JsonModel, c: number) => primitiveKey(m, childByKey(m, c, mk));
        const lmap = new Map<string, number>();
        la.forEach((c) => lmap.set(sig(l, c), c));
        const pairs: [number, number][] = [];
        const used = new Set<number>();
        for (const rc of ra) {
          const lc = lmap.get(sig(r, rc));
          if (lc === undefined) add(rc);
          else {
            pairs.push([lc, rc]);
            used.add(lc);
          }
        }
        for (const lc of la) if (!used.has(lc)) remove(lc);
        const keep = lisIndexes(pairs.map((p) => l.ord[p[0]] as number));
        // pairs are in right order; items outside the LIS of left ordinals have moved
        pairs.forEach(([lc, rc], i) => visit(lc, rc, !keep.has(i)));
        return;
      }
    }
    if (opts.ignoreArrayOrder) {
      const buckets = new Map<string, number[]>();
      for (const c of la) {
        const k = canonicalize(l, c);
        (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(c);
      }
      const restR: number[] = [];
      for (const rc of ra) {
        const b = buckets.get(canonicalize(r, rc));
        if (b && b.length) b.shift();
        else restR.push(rc);
      }
      const restL = [...buckets.values()].flat().sort((a, b) => a - b);
      const n = Math.min(restL.length, restR.length);
      for (let i = 0; i < n; i++) visit(restL[i] as number, restR[i] as number);
      for (let i = n; i < restR.length; i++) add(restR[i] as number);
      for (let i = n; i < restL.length; i++) remove(restL[i] as number);
      return;
    }
    const n = Math.min(la.length, ra.length);
    for (let i = 0; i < n; i++) visit(la[i] as number, ra[i] as number);
    for (let i = n; i < ra.length; i++) add(ra[i] as number);
    for (let i = n; i < la.length; i++) remove(la[i] as number);
  };

  if (l.count && r.count) visit(0, 0);
  return changes;
}

/** Child ordering used when normalizing a side for the text diff. */
export function arrayOrderFor(opts: DiffOptions): ChildOrder | undefined {
  const mk = opts.arrayMatchKey.trim();
  if (!opts.ignoreArrayOrder && !mk) return undefined;
  return (m, id, ids) => {
    if (m.type[id] !== T_ARRAY) return ids;
    const sig = (c: number): string => {
      if (mk && m.type[c] === T_OBJECT) {
        const f = childByKey(m, c, mk);
        if (f >= 0) return primitiveKey(m, f);
      }
      return opts.ignoreArrayOrder ? canonicalize(m, c) : '';
    };
    const keyed = new Map(ids.map((c) => [c, sig(c)]));
    return [...ids].sort((a, b) =>
      (keyed.get(a) as string) < (keyed.get(b) as string)
        ? -1
        : (keyed.get(a) as string) > (keyed.get(b) as string)
          ? 1
          : 0,
    );
  };
}

export interface NormalizedSide {
  text: string;
  lines: Int32Array;
}

export function normalizeSide(m: JsonModel, opts: DiffOptions): NormalizedSide {
  return normalize(m, { indent: opts.indent, sortKeys: opts.ignoreKeyOrder, order: arrayOrderFor(opts) });
}
