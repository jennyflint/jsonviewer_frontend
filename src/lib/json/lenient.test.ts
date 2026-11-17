import { describe, expect, it } from 'vitest';
import { parseJson } from './parser';
import { toStrictJson } from './format';
import { children, keyOf, stringValue } from './access';
import { redactModel, DEFAULT_REDACT } from './redact';

const lenient = (t: string) => {
  const r = parseJson(t, { lenient: true });
  if (!r.ok) throw new Error(`${r.error.message} @${r.error.line}:${r.error.column}`);
  return r.model;
};
const strict = (t: string) => JSON.parse(toStrictJson(lenient(t), null));

describe('JSON5 / JSONC (lenient parsing)', () => {
  it('strict mode still rejects every extension', () => {
    for (const t of ['{"a":1,}', '[1,2,]', '// c\n{}', '{a:1}', "{'a':1}", '[0x10]', '[.5]', '[+1]', '[NaN]'])
      expect(parseJson(t).ok, t).toBe(false);
  });
  it('accepts comments and trailing commas (JSONC)', () => {
    const t = '{\n  // line\n  "a": 1, /* block */\n  "b": [1, 2,],\n}';
    expect(strict(t)).toEqual({ a: 1, b: [1, 2] });
    expect(lenient(t).lenient).toBe(true);
  });
  it('accepts unquoted keys and single-quoted strings (JSON5)', () => {
    const m = lenient("{ unquoted: 'it\\'s', $x: \"d\", 'q k': 1, _y: [1] }");
    expect(children(m, 0).map((c) => keyOf(m, c))).toEqual(['unquoted', '$x', 'q k', '_y']);
    expect(stringValue(m, 1)).toBe("it's");
    expect(strict("{ unquoted: 'it\\'s' }")).toEqual({ unquoted: "it's" });
  });
  it('accepts JSON5 numbers and converts them to strict JSON', () => {
    expect(strict('[0xFF, -0x10, +1, .5, -.5, 5., 1e3, Infinity, -Infinity, NaN]')).toEqual([
      255,
      -16,
      1,
      0.5,
      -0.5,
      5,
      1000,
      null,
      null,
      null,
    ]);
  });
  it('accepts JSON5 string escapes and line continuations', () => {
    expect(strict('[\'\\x41\\v\\0\', "a\\\nb"]')).toEqual(['A\v\0', 'ab']);
  });
  it('reports errors with positions, including unterminated comments', () => {
    const r = parseJson('{"a":1 /* x', { lenient: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('Unterminated comment');
    const bad = parseJson('{a:}', { lenient: true });
    expect(bad.ok).toBe(false);
  });
  it('plain JSON parses the same in both modes (and is not flagged)', () => {
    const a = parseJson('{"a":[1,"x",null]}');
    const b = parseJson('{"a":[1,"x",null]}', { lenient: true });
    if (!a.ok || !b.ok) throw new Error();
    expect(Array.from(a.model.type)).toEqual(Array.from(b.model.type));
    expect(a.model.lenient).toBeUndefined();
  });
  it('trailing comma inside empty / nested containers', () => {
    expect(strict('{"a":{"b":[],},}')).toEqual({ a: { b: [] } });
  });
  it('redaction works on JSON5 keys too', () => {
    const m = lenient("{password: 'x', ok: 1}");
    const r = redactModel(m, DEFAULT_REDACT);
    expect(JSON.parse(toStrictJson(lenient(r.text), null))).toEqual({ password: '***', ok: 1 });
  });
});
