import { T_ARRAY, T_FALSE, T_NULL, T_NUMBER, T_OBJECT, T_STRING, T_TRUE, TYPE_NAMES, locate } from './parser';
import type { JsonModel, NodeType } from './parser';

export function isContainer(m: JsonModel, id: number): boolean {
  const t = m.type[id] as number;
  return t === T_OBJECT || t === T_ARRAY;
}

export function typeName(m: JsonModel, id: number): NodeType {
  return TYPE_NAMES[m.type[id] as number] as NodeType;
}

/** Raw source lexeme of a node's value (for containers: the whole source slice). */
export function raw(m: JsonModel, id: number): string {
  return m.text.slice(m.start[id] as number, m.end[id] as number);
}

/** Decode a JSON string token (including quotes). */
export function decodeToken(tok: string): string {
  if (tok.indexOf('\\') === -1) return tok.slice(1, -1);
  try {
    return JSON.parse(tok) as string;
  } catch {
    return tok.slice(1, -1);
  }
}

export function rawKey(m: JsonModel, id: number): string | null {
  const s = m.keyStart[id] as number;
  if (s < 0) return null;
  return m.text.slice(s, m.keyEnd[id] as number);
}

/** Decoded key of an object member, or null. */
export function keyOf(m: JsonModel, id: number): string | null {
  const t = rawKey(m, id);
  return t === null ? null : decodeToken(t);
}

/** Decoded string value of a string node. */
export function stringValue(m: JsonModel, id: number): string {
  return decodeToken(raw(m, id));
}

export function children(m: JsonModel, id: number): number[] {
  const out: number[] = [];
  for (let c = m.firstChild[id] as number; c >= 0; c = m.nextSibling[c] as number) out.push(c);
  return out;
}

export function isPrimitive(m: JsonModel, id: number): boolean {
  return !isContainer(m, id);
}

/** Position (1-based) of a node's start, or of its key if it is an object member. */
export function nodePosition(
  m: JsonModel,
  id: number,
  useKey = false,
): { line: number; column: number; offset: number } {
  const ks = m.keyStart[id] as number;
  const offset = useKey && ks >= 0 ? ks : (m.start[id] as number);
  return { ...locate(m.lineStarts, offset), offset };
}

/** Last member with the given key (JSON.parse semantics). */
export function childByKey(m: JsonModel, id: number, key: string): number {
  let found = -1;
  for (let c = m.firstChild[id] as number; c >= 0; c = m.nextSibling[c] as number) {
    if (keyOf(m, c) === key) found = c;
  }
  return found;
}

export function childByIndex(m: JsonModel, id: number, index: number): number {
  let c = m.firstChild[id] as number;
  for (let k = 0; c >= 0 && k < index; k++) c = m.nextSibling[c] as number;
  return c;
}

/** Short display form of a value (containers show their child count). */
export function previewValue(m: JsonModel, id: number, max = 200): string {
  const t = m.type[id] as number;
  switch (t) {
    case T_OBJECT:
      return `{${m.childCount[id]}}`;
    case T_ARRAY:
      return `[${m.childCount[id]}]`;
    case T_STRING: {
      const s = raw(m, id);
      return s.length > max + 2 ? s.slice(0, max + 1) + '…"' : s;
    }
    case T_NUMBER:
    case T_TRUE:
    case T_FALSE:
    case T_NULL:
      return raw(m, id);
  }
  return '';
}

/** Ancestors from root to `id` (inclusive). */
export function ancestors(m: JsonModel, id: number): number[] {
  const out: number[] = [];
  for (let c = id; c >= 0; c = m.parent[c] as number) out.push(c);
  return out.reverse();
}

/** Flag: node is a member of an object that contains the same key more than once. */
export function duplicateKeyNodes(m: JsonModel): Set<number> {
  const out = new Set<number>();
  for (let id = 0; id < m.count; id++) {
    if ((m.type[id] as number) !== T_OBJECT || (m.childCount[id] as number) < 2) continue;
    const seen = new Map<string, number[]>();
    for (let c = m.firstChild[id] as number; c >= 0; c = m.nextSibling[c] as number) {
      const k = keyOf(m, c) as string;
      const l = seen.get(k);
      if (l) l.push(c);
      else seen.set(k, [c]);
    }
    for (const l of seen.values()) if (l.length > 1) for (const c of l) out.add(c);
  }
  return out;
}

/** Deepest node whose span (including the member key) contains `offset`, or -1. */
export function nodeAtOffset(m: JsonModel, offset: number): number {
  if (m.count === 0) return -1;
  const spanStart = (id: number) => {
    const ks = m.keyStart[id] as number;
    return ks >= 0 ? ks : (m.start[id] as number);
  };
  let lo = 0;
  let hi = m.count - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spanStart(mid) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  for (let id = found; id >= 0; id = m.parent[id] as number) {
    if (offset < (m.end[id] as number) && offset >= spanStart(id)) return id;
  }
  return found >= 0 && (m.parent[found] as number) < 0 ? 0 : -1;
}

/** Object members whose key token starts in [from, to): used to colour keys by value type in the viewport. */
export function memberKeysInRange(
  m: JsonModel,
  from: number,
  to: number,
  limit = 5000,
): { from: number; to: number; id: number }[] {
  const spanStart = (id: number) => {
    const ks = m.keyStart[id] as number;
    return ks >= 0 ? ks : (m.start[id] as number);
  };
  let lo = 0;
  let hi = m.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spanStart(mid) < from) lo = mid + 1;
    else hi = mid;
  }
  const out: { from: number; to: number; id: number }[] = [];
  for (let id = lo; id < m.count && spanStart(id) < to && out.length < limit; id++) {
    const ks = m.keyStart[id] as number;
    if (ks >= 0) out.push({ from: ks, to: m.keyEnd[id] as number, id });
  }
  return out;
}
