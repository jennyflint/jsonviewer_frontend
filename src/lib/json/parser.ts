/**
 * Iterative, positional RFC 8259 parser.
 *
 * Output is a flat struct-of-arrays table (ids are assigned in document / pre-order), which keeps
 * duplicate object keys, raw number lexemes and source offsets, and can be transferred between
 * threads without cloning millions of objects.
 */

export const MAX_DEPTH = 512;

export const T_OBJECT = 0;
export const T_ARRAY = 1;
export const T_STRING = 2;
export const T_NUMBER = 3;
export const T_TRUE = 4;
export const T_FALSE = 5;
export const T_NULL = 6;

export type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
export const TYPE_NAMES: NodeType[] = ['object', 'array', 'string', 'number', 'boolean', 'boolean', 'null'];

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

/** Flat node table. Node ids are pre-order indexes; the subtree of `i` is `[i, subtreeEnd[i])`. */
export interface JsonModel {
  /** Source text (BOM stripped). Raw lexemes are slices of it. */
  text: string;
  count: number;
  maxDepth: number;
  type: Uint8Array;
  parent: Int32Array;
  firstChild: Int32Array;
  nextSibling: Int32Array;
  childCount: Uint32Array;
  /** Pre-order id of the first node after this node's subtree. */
  subtreeEnd: Uint32Array;
  depth: Uint16Array;
  /** Ordinal of the node within its parent (array index / member position). */
  ord: Uint32Array;
  /** Value span in `text`. */
  start: Uint32Array;
  end: Uint32Array;
  /** Key token span (including quotes) for object members, -1 otherwise. */
  keyStart: Int32Array;
  keyEnd: Int32Array;
  /** Offsets at which each line starts. */
  lineStarts: Uint32Array;
}

export type ParseResult = { ok: true; model: JsonModel } | { ok: false; error: ParseError };

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function computeLineStarts(text: string): Uint32Array {
  const starts: number[] = [0];
  let i = text.indexOf('\n');
  while (i !== -1) {
    starts.push(i + 1);
    i = text.indexOf('\n', i + 1);
  }
  return Uint32Array.from(starts);
}

/** Binary search for the 1-based line / column of an offset. */
export function locate(lineStarts: Uint32Array, offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((lineStarts[mid] as number) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - (lineStarts[lo] as number) + 1 };
}

class Fail extends Error {
  constructor(
    public offset: number,
    message: string,
  ) {
    super(message);
  }
}

// parser states
const S_VALUE = 0; // expecting a value
const S_VALUE_OR_END = 1; // after '[' : value or ']'
const S_KEY_OR_END = 2; // after '{' : key or '}'
const S_KEY = 3; // after ',' in object: key
const S_AFTER = 4; // after a value: ',' or closer

function isWs(c: number): boolean {
  return c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;
}

function describe(text: string, i: number): string {
  if (i >= text.length) return 'end of input';
  const ch = text[i] as string;
  return `'${ch === '\n' ? '\\n' : ch}'`;
}

export function parseJson(input: string): ParseResult {
  const text = stripBom(input);
  const n = text.length;
  let cap = 1024;
  let type = new Uint8Array(cap);
  let parent = new Int32Array(cap);
  let firstChild = new Int32Array(cap);
  let nextSibling = new Int32Array(cap);
  let lastChild = new Int32Array(cap);
  let childCount = new Uint32Array(cap);
  let subtreeEnd = new Uint32Array(cap);
  let depthArr = new Uint16Array(cap);
  let ord = new Uint32Array(cap);
  let start = new Uint32Array(cap);
  let end = new Uint32Array(cap);
  let keyStart = new Int32Array(cap);
  let keyEnd = new Int32Array(cap);
  let count = 0;
  let maxDepth = 0;

  const grow = () => {
    cap *= 2;
    const g = <T extends Uint8Array | Int32Array | Uint32Array | Uint16Array>(a: T): T => {
      const b = new (a.constructor as new (n: number) => T)(cap);
      b.set(a);
      return b;
    };
    type = g(type);
    parent = g(parent);
    firstChild = g(firstChild);
    nextSibling = g(nextSibling);
    lastChild = g(lastChild);
    childCount = g(childCount);
    subtreeEnd = g(subtreeEnd);
    depthArr = g(depthArr);
    ord = g(ord);
    start = g(start);
    end = g(end);
    keyStart = g(keyStart);
    keyEnd = g(keyEnd);
  };

  const stack: number[] = [];
  let i = 0;
  let state: number = S_VALUE;
  let pkS = -1;
  let pkE = -1;

  const addNode = (t: number, s: number): number => {
    if (count === cap) grow();
    const id = count++;
    const p = stack.length ? (stack[stack.length - 1] as number) : -1;
    type[id] = t;
    parent[id] = p;
    firstChild[id] = -1;
    nextSibling[id] = -1;
    lastChild[id] = -1;
    childCount[id] = 0;
    depthArr[id] = stack.length;
    start[id] = s;
    end[id] = s;
    keyStart[id] = pkS;
    keyEnd[id] = pkE;
    pkS = -1;
    pkE = -1;
    if (p >= 0) {
      ord[id] = childCount[p] as number;
      childCount[p] = (childCount[p] as number) + 1;
      const lc = lastChild[p] as number;
      if (lc >= 0) nextSibling[lc] = id;
      else firstChild[p] = id;
      lastChild[p] = id;
    } else ord[id] = 0;
    if (t < 2 && stack.length + 1 > maxDepth) maxDepth = stack.length + 1;
    return id;
  };

  const skipWs = () => {
    while (i < n && isWs(text.charCodeAt(i))) i++;
  };

  const scanString = (): number => {
    // text[i] === '"'; returns the offset just past the closing quote
    const s = i;
    let j = i + 1;
    for (;;) {
      if (j >= n) throw new Fail(s, 'Unterminated string');
      const c = text.charCodeAt(j);
      if (c === 0x22) return j + 1;
      if (c < 0x20) throw new Fail(j, 'Invalid control character in string');
      if (c === 0x5c) {
        const e = text.charCodeAt(j + 1);
        if (Number.isNaN(e)) throw new Fail(s, 'Unterminated string');
        switch (e) {
          case 0x22:
          case 0x5c:
          case 0x2f:
          case 0x62:
          case 0x66:
          case 0x6e:
          case 0x72:
          case 0x74:
            j += 2;
            break;
          case 0x75: {
            for (let k = 2; k < 6; k++) {
              const h = text.charCodeAt(j + k);
              const hex = (h >= 0x30 && h <= 0x39) || (h >= 0x41 && h <= 0x46) || (h >= 0x61 && h <= 0x66);
              if (!hex) throw new Fail(j, 'Invalid unicode escape sequence \\u');
            }
            j += 6;
            break;
          }
          default:
            throw new Fail(j, `Invalid escape sequence \\${text[j + 1]}`);
        }
      } else j++;
    }
  };

  const scanNumber = (): number => {
    const s = i;
    let j = i;
    if (text.charCodeAt(j) === 0x2d) j++;
    let c = text.charCodeAt(j);
    if (c === 0x30) j++;
    else if (c >= 0x31 && c <= 0x39) {
      while ((c = text.charCodeAt(j)) >= 0x30 && c <= 0x39) j++;
    } else throw new Fail(s, 'Invalid number');
    if (text.charCodeAt(j) === 0x2e) {
      j++;
      c = text.charCodeAt(j);
      if (!(c >= 0x30 && c <= 0x39)) throw new Fail(s, 'Invalid number: expected digits after decimal point');
      while ((c = text.charCodeAt(j)) >= 0x30 && c <= 0x39) j++;
    }
    c = text.charCodeAt(j);
    if (c === 0x65 || c === 0x45) {
      j++;
      c = text.charCodeAt(j);
      if (c === 0x2b || c === 0x2d) j++;
      c = text.charCodeAt(j);
      if (!(c >= 0x30 && c <= 0x39)) throw new Fail(s, 'Invalid number: expected digits in exponent');
      while ((c = text.charCodeAt(j)) >= 0x30 && c <= 0x39) j++;
    }
    return j;
  };

  const closeContainer = () => {
    const id = stack.pop() as number;
    end[id] = i;
    subtreeEnd[id] = count;
  };

  try {
    for (;;) {
      skipWs();
      switch (state) {
        case S_VALUE:
        case S_VALUE_OR_END: {
          if (i >= n) throw new Fail(n, 'Unexpected end of input');
          const c = text.charCodeAt(i);
          if (state === S_VALUE_OR_END && c === 0x5d) {
            i++;
            closeContainer();
            state = S_AFTER;
            break;
          }
          if (c === 0x7b || c === 0x5b) {
            if (stack.length >= MAX_DEPTH) throw new Fail(i, `Maximum nesting depth (${MAX_DEPTH}) exceeded`);
            const id = addNode(c === 0x7b ? T_OBJECT : T_ARRAY, i);
            stack.push(id);
            i++;
            state = c === 0x7b ? S_KEY_OR_END : S_VALUE_OR_END;
          } else if (c === 0x22) {
            const e = scanString();
            const id = addNode(T_STRING, i);
            end[id] = e;
            subtreeEnd[id] = count;
            i = e;
            state = S_AFTER;
          } else if (c === 0x2d || (c >= 0x30 && c <= 0x39)) {
            const e = scanNumber();
            const id = addNode(T_NUMBER, i);
            end[id] = e;
            subtreeEnd[id] = count;
            i = e;
            state = S_AFTER;
          } else if (c === 0x74 && text.startsWith('true', i)) {
            const id = addNode(T_TRUE, i);
            i += 4;
            end[id] = i;
            subtreeEnd[id] = count;
            state = S_AFTER;
          } else if (c === 0x66 && text.startsWith('false', i)) {
            const id = addNode(T_FALSE, i);
            i += 5;
            end[id] = i;
            subtreeEnd[id] = count;
            state = S_AFTER;
          } else if (c === 0x6e && text.startsWith('null', i)) {
            const id = addNode(T_NULL, i);
            i += 4;
            end[id] = i;
            subtreeEnd[id] = count;
            state = S_AFTER;
          } else if (c === 0x7d || c === 0x5d) {
            let k = i - 1;
            while (k >= 0 && isWs(text.charCodeAt(k))) k--;
            if (k >= 0 && text.charCodeAt(k) === 0x2c) throw new Fail(i, 'Trailing comma is not allowed');
            throw new Fail(i, `Unexpected ${describe(text, i)}: expected a value`);
          } else if (c === 0x2c) {
            throw new Fail(i, `Unexpected ',': expected a value`);
          } else {
            throw new Fail(i, `Unexpected token ${describe(text, i)}`);
          }
          break;
        }
        case S_KEY_OR_END:
        case S_KEY: {
          if (i >= n) throw new Fail(n, 'Unexpected end of input');
          const c = text.charCodeAt(i);
          if (state === S_KEY_OR_END && c === 0x7d) {
            i++;
            closeContainer();
            state = S_AFTER;
            break;
          }
          if (c === 0x7d) throw new Fail(i, 'Trailing comma is not allowed');
          if (c !== 0x22) throw new Fail(i, 'Expected property name in double quotes');
          const e = scanString();
          pkS = i;
          pkE = e;
          i = e;
          skipWs();
          if (i >= n) throw new Fail(n, 'Unexpected end of input');
          if (text.charCodeAt(i) !== 0x3a) throw new Fail(i, "Expected ':' after object key");
          i++;
          state = S_VALUE;
          break;
        }
        case S_AFTER: {
          if (!stack.length) {
            if (i < n) throw new Fail(i, 'Unexpected content after end of document');
            return finish();
          }
          if (i >= n) throw new Fail(n, 'Unexpected end of input');
          const top = stack[stack.length - 1] as number;
          const isObj = type[top] === T_OBJECT;
          const c = text.charCodeAt(i);
          if (c === 0x2c) {
            i++;
            state = isObj ? S_KEY : S_VALUE;
          } else if (c === (isObj ? 0x7d : 0x5d)) {
            i++;
            closeContainer();
          } else {
            throw new Fail(
              i,
              isObj ? "Expected ',' or '}' after object member" : "Expected ',' or ']' after array element",
            );
          }
          break;
        }
      }
    }
  } catch (e) {
    if (e instanceof Fail) {
      const ls = computeLineStarts(text.slice(0, Math.min(e.offset + 1, n)));
      const { line, column } = locate(ls, Math.min(e.offset, n));
      return { ok: false, error: { message: e.message, line, column, offset: e.offset } };
    }
    throw e;
  }

  function finish(): ParseResult {
    const model: JsonModel = {
      text,
      count,
      maxDepth,
      type: type.slice(0, count),
      parent: parent.slice(0, count),
      firstChild: firstChild.slice(0, count),
      nextSibling: nextSibling.slice(0, count),
      childCount: childCount.slice(0, count),
      subtreeEnd: subtreeEnd.slice(0, count),
      depth: depthArr.slice(0, count),
      ord: ord.slice(0, count),
      start: start.slice(0, count),
      end: end.slice(0, count),
      keyStart: keyStart.slice(0, count),
      keyEnd: keyEnd.slice(0, count),
      lineStarts: computeLineStarts(text),
    };
    return { ok: true, model };
  }
}

/** The ArrayBuffers of a model, for `postMessage` transfer lists. */
export function modelBuffers(m: JsonModel): ArrayBuffer[] {
  return [
    m.type,
    m.parent,
    m.firstChild,
    m.nextSibling,
    m.childCount,
    m.subtreeEnd,
    m.depth,
    m.ord,
    m.start,
    m.end,
    m.keyStart,
    m.keyEnd,
    m.lineStarts,
  ].map((a) => a.buffer as ArrayBuffer);
}
