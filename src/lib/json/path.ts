import { keyOf, childByIndex, childByKey } from './access';
import { T_ARRAY, T_OBJECT } from './parser';
import type { JsonModel } from './parser';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export type PathSegment = string | number;

export function segmentToString(seg: PathSegment): string {
  if (typeof seg === 'number') return `[${seg}]`;
  return IDENT.test(seg) ? `.${seg}` : `[${JSON.stringify(seg)}]`;
}

export function segmentsToPath(segs: PathSegment[]): string {
  let s = '$';
  for (const seg of segs) s += segmentToString(seg);
  return s;
}

export function pathSegments(m: JsonModel, id: number): PathSegment[] {
  const out: PathSegment[] = [];
  for (let c = id; c >= 0 && (m.parent[c] as number) >= 0; c = m.parent[c] as number) {
    const p = m.parent[c] as number;
    out.push(m.type[p] === T_ARRAY ? (m.ord[c] as number) : (keyOf(m, c) as string));
  }
  return out.reverse();
}

export function buildPath(m: JsonModel, id: number): string {
  return segmentsToPath(pathSegments(m, id));
}

const TOKEN = /\.([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/y;

/** Parse a path string. Returns null on a syntax error. */
export function parsePath(path: string): PathSegment[] | null {
  const p = path.trim();
  if (!p.startsWith('$')) return null;
  const out: PathSegment[] = [];
  TOKEN.lastIndex = 1;
  let pos = 1;
  while (pos < p.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(p);
    if (!m) return null;
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push(m[1]);
    else if (m[2] !== undefined) out.push(Number(m[2]));
    else {
      try {
        out.push(JSON.parse(m[3] as string) as string);
      } catch {
        return null;
      }
    }
  }
  return out;
}

/** Resolve a path to a node id, or -1. Duplicate keys resolve to the last member. */
export function resolvePath(m: JsonModel, path: string | PathSegment[]): number {
  const segs = typeof path === 'string' ? parsePath(path) : path;
  if (!segs || m.count === 0) return -1;
  let cur = 0;
  for (const seg of segs) {
    const t = m.type[cur];
    if (typeof seg === 'number') {
      if (t !== T_ARRAY) return -1;
      cur = childByIndex(m, cur, seg);
    } else {
      if (t !== T_OBJECT) return -1;
      cur = childByKey(m, cur, seg);
    }
    if (cur < 0) return -1;
  }
  return cur;
}
