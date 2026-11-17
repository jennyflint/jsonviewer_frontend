/** Formatting straight from the parsed model: raw number lexemes and duplicate keys are preserved. */
import { children, rawKey, keyOf, raw, strictKey, strictRaw } from './access';
import { compareCodePoints } from './canonical';
import { T_ARRAY, T_OBJECT } from './parser';
import type { JsonModel } from './parser';

export type Indent = 2 | 4 | '\t';

export type ChildOrder = (m: JsonModel, id: number, ids: number[]) => number[];

interface Opts {
  indent: Indent | null; // null = minify
  sort: boolean;
  recursive: boolean;
  /** Optional re-ordering of children (used to normalize arrays before diffing). */
  order?: ChildOrder;
  /** Rewrite JSON5 / JSONC tokens as strict JSON (quoted keys, double-quoted strings, plain numbers). */
  strict?: boolean;
  /** Receives the 1-based line on which each node starts (pretty output only). */
  lines?: Int32Array;
}

function serialize(m: JsonModel, o: Opts, root = 0): string {
  const out: string[] = [];
  const unit = o.indent === null ? '' : o.indent === '\t' ? '\t' : ' '.repeat(o.indent);
  const nl = o.indent === null ? '' : '\n';
  const colon = o.indent === null ? ':' : ': ';
  type Frame = { ids: number[]; idx: number; closer: string; level: number };
  const stack: Frame[] = [];

  const members = (id: number, level: number): number[] => {
    const ids = children(m, id);
    if (o.sort && m.type[id] === T_OBJECT && (o.recursive || level === 0)) {
      const keys = new Map<number, string>(ids.map((c) => [c, keyOf(m, c) as string]));
      // stable: Array.prototype.sort is stable, so duplicate keys keep source order
      ids.sort((a, b) => compareCodePoints(keys.get(a) as string, keys.get(b) as string));
    }
    return o.order ? o.order(m, id, ids) : ids;
  };
  let line = 1;
  const track = !!o.lines;
  // "\n" + indentation, cached per nesting level
  const nlIndents: string[] = [];
  const nlIndent = (level: number): string =>
    nlIndents[level] ?? (nlIndents[level] = nl + unit.repeat(level));

  const emitValue = (id: number, level: number) => {
    const t = m.type[id] as number;
    if ((t === T_OBJECT || t === T_ARRAY) && (m.childCount[id] as number) > 0) {
      out.push(t === T_OBJECT ? '{' : '[');
      stack.push({ ids: members(id, level), idx: 0, closer: t === T_OBJECT ? '}' : ']', level });
    } else if (t === T_OBJECT) out.push('{}');
    else if (t === T_ARRAY) out.push('[]');
    else out.push(o.strict ? strictRaw(m, id) : raw(m, id));
  };

  if (m.count === 0) return '';
  if (o.lines) o.lines[root] = 1;
  emitValue(root, 0);
  while (stack.length) {
    const f = stack[stack.length - 1] as Frame;
    if (f.idx >= f.ids.length) {
      out.push(nlIndent(stack.length - 1), f.closer);
      if (track && nl) line++;
      stack.pop();
      continue;
    }
    const id = f.ids[f.idx++] as number;
    out.push(f.idx > 1 ? ',' + nlIndent(stack.length) : nlIndent(stack.length));
    if (track) {
      if (nl) line++;
      (o.lines as Int32Array)[id] = line;
    }
    const k = o.strict ? strictKey(m, id) : rawKey(m, id);
    if (k !== null) out.push(k, colon);
    emitValue(id, f.level + 1);
  }
  return out.join('');
}

export function pretty(m: JsonModel, indent: Indent = 2): string {
  return serialize(m, { indent, sort: false, recursive: true });
}

export function minify(m: JsonModel): string {
  return serialize(m, { indent: null, sort: false, recursive: true });
}

export function sortKeys(m: JsonModel, indent: Indent = 2, recursive = true): string {
  return serialize(m, { indent, sort: true, recursive });
}

/** Normalized pretty text plus the start line of every node (for linking structural changes to diff lines). */
export function normalize(
  m: JsonModel,
  opts: { indent: Indent; sortKeys: boolean; order?: ChildOrder },
): { text: string; lines: Int32Array } {
  const lines = new Int32Array(m.count);
  const text = serialize(m, {
    indent: opts.indent,
    sort: opts.sortKeys,
    recursive: true,
    order: opts.order,
    lines,
  });
  return { text, lines };
}

/** Pretty-print a single subtree (used by "Copy subtree as JSON"). */
export function prettyNode(m: JsonModel, id: number, indent: Indent = 2): string {
  return serialize(m, { indent, sort: false, recursive: true }, id);
}

/** Strict JSON text of a (possibly JSON5 / JSONC) document: comments are dropped, tokens normalized. */
export function toStrictJson(m: JsonModel, indent: Indent | null = 2): string {
  return serialize(m, { indent, sort: false, recursive: true, strict: true });
}
