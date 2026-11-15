/**
 * Canonical form: sorted keys, no whitespace, normalized numbers, last duplicate key wins.
 * Must match the backend (`app.lib.json_utils.canonicalize`) so content hashes agree.
 */
import { children, decodeToken, keyOf, raw } from './access';
import { T_ARRAY, T_FALSE, T_NULL, T_NUMBER, T_OBJECT, T_STRING, T_TRUE } from './parser';
import type { JsonModel } from './parser';

/** Compare strings by Unicode code point (Python `sorted` order), not by UTF-16 unit. */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);
    if (x === y) continue;
    if (x >= 0xd800 && y >= 0xd800) {
      x = x >= 0xe000 ? x - 0x800 : x + 0x2000;
      y = y >= 0xe000 ? y - 0x800 : y + 0x2000;
    }
    return x - y;
  }
  return a.length - b.length;
}

/** Python `repr(float)` for finite values. */
export function pyFloatRepr(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const exp = x.toExponential(); // shortest round-trip digits: d.ddde+X
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(exp);
  if (!m) return String(x);
  const sign = m[1] as string;
  const digits = (m[2] as string) + ((m[3] as string | undefined) ?? '');
  const e = Number(m[4]);
  if (e >= -4 && e < 16) {
    if (e >= 0) {
      const intLen = e + 1;
      const ip = digits.length > intLen ? digits.slice(0, intLen) : digits.padEnd(intLen, '0');
      const fp = digits.length > intLen ? digits.slice(intLen) : '0';
      return `${sign}${ip}.${fp}`;
    }
    return `${sign}0.${'0'.repeat(-e - 1)}${digits}`;
  }
  const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  const es = Math.abs(e) < 10 ? `0${Math.abs(e)}` : String(Math.abs(e));
  return `${sign}${mant}e${e < 0 ? '-' : '+'}${es}`;
}

const NUM = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** Canonical string of a JSON number lexeme: `1.0`, `1e2` and `100` compare equal. */
export function canonicalNumber(lexeme: string): string {
  const m = NUM.exec(lexeme);
  if (!m) return lexeme;
  const neg = m[1] === '-';
  const intPart = m[2] as string;
  const frac = (m[3] as string | undefined) ?? '';
  const exp10 = m[4] ? Number(m[4]) : 0;
  let digits = (intPart + frac).replace(/^0+/, '');
  if (digits === '') return '0';
  let exponent = exp10 - frac.length;
  const trimmed = digits.replace(/0+$/, '');
  exponent += digits.length - trimmed.length;
  digits = trimmed;
  const adjusted = exponent + digits.length - 1;
  if (adjusted > 400 || adjusted < -400) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${neg ? '-' : ''}${mant}E${adjusted < 0 ? '-' : '+'}${Math.abs(adjusted)}`;
  }
  if (exponent >= 0) return (neg ? '-' : '') + digits + '0'.repeat(exponent);
  return pyFloatRepr(Number(lexeme));
}

/** Sorted-by-key member list with duplicates removed (last wins). */
export function effectiveMembers(m: JsonModel, id: number): { key: string; id: number }[] {
  const map = new Map<string, number>();
  for (const c of children(m, id)) map.set(keyOf(m, c) as string, c);
  return [...map.entries()]
    .map(([key, cid]) => ({ key, id: cid }))
    .sort((a, b) => compareCodePoints(a.key, b.key));
}

type Frame = { members: { key: string | null; id: number }[]; idx: number; arr: boolean };

/** Canonical text of the subtree rooted at `root` (default: whole document). */
export function canonicalize(m: JsonModel, root = 0): string {
  const out: string[] = [];
  const stack: Frame[] = [];
  const emit = (id: number) => {
    const t = m.type[id] as number;
    switch (t) {
      case T_OBJECT:
        out.push('{');
        stack.push({ members: effectiveMembers(m, id), idx: 0, arr: false });
        return;
      case T_ARRAY:
        out.push('[');
        stack.push({ members: children(m, id).map((c) => ({ key: null, id: c })), idx: 0, arr: true });
        return;
      case T_STRING:
        out.push(JSON.stringify(decodeToken(raw(m, id))));
        return;
      case T_NUMBER:
        out.push(canonicalNumber(raw(m, id)));
        return;
      case T_TRUE:
        out.push('true');
        return;
      case T_FALSE:
        out.push('false');
        return;
      case T_NULL:
        out.push('null');
        return;
    }
  };
  emit(root);
  while (stack.length) {
    const f = stack[stack.length - 1] as Frame;
    if (f.idx >= f.members.length) {
      out.push(f.arr ? ']' : '}');
      stack.pop();
      continue;
    }
    const mem = f.members[f.idx++] as { key: string | null; id: number };
    if (f.idx > 1) out.push(',');
    if (mem.key !== null) out.push(JSON.stringify(mem.key), ':');
    emit(mem.id);
  }
  return out.join('');
}
