import { describe, expect, it } from 'vitest';
import { keyOf, raw, children, stringValue } from './access';
import { MAX_DEPTH, parseJson, T_ARRAY, T_OBJECT } from './parser';
import type { JsonModel } from './parser';

function ok(text: string): JsonModel {
  const r = parseJson(text);
  if (!r.ok) throw new Error(`${r.error.message} @${r.error.line}:${r.error.column}`);
  return r.model;
}
function err(text: string) {
  const r = parseJson(text);
  if (r.ok) throw new Error('expected error');
  return r.error;
}

describe('parser: valid documents', () => {
  it('parses scalars and containers', () => {
    expect(ok('1').count).toBe(1);
    expect(ok('"a"').type[0]).toBe(2);
    expect(ok('  [ ]  ').type[0]).toBe(T_ARRAY);
    const m = ok('{"a":[1,2,{"b":null}],"c":"d"}');
    expect(m.count).toBe(7);
    expect(m.maxDepth).toBe(3);
    expect(m.subtreeEnd[0]).toBe(7);
    expect(m.parent[6]).toBe(0);
  });
  it('records depth, ordinals and spans', () => {
    const m = ok('{"a":[10,20]}');
    expect(m.depth[3]).toBe(2);
    expect(m.ord[3]).toBe(1);
    expect(raw(m, 3)).toBe('20');
    expect(keyOf(m, 1)).toBe('a');
  });
  it('keeps duplicate keys in source order', () => {
    const m = ok('{"a":1,"a":2,"b":3}');
    expect(children(m, 0).map((c) => keyOf(m, c))).toEqual(['a', 'a', 'b']);
  });
  it('preserves raw number lexemes', () => {
    const m = ok('[12345678901234567890, 1.0, 1E+2, -0.10]');
    expect(children(m, 0).map((c) => raw(m, c))).toEqual(['12345678901234567890', '1.0', '1E+2', '-0.10']);
  });
  it('handles unicode and escapes', () => {
    const m = ok('{"k\\u00e9":"\\ud83d\\ude00 \\n \\" \\\\ \\/","é":"日本"}');
    expect(keyOf(m, 1)).toBe('ké');
    expect(stringValue(m, 1)).toBe('😀 \n " \\ /');
    expect(keyOf(m, 2)).toBe('é');
  });
  it('strips a UTF-8 BOM', () => {
    expect(ok('﻿[1]').text).toBe('[1]');
  });
  it('computes line starts', () => {
    expect(Array.from(ok('{\n"a":1,\n"b":2\n}').lineStarts)).toEqual([0, 2, 9, 15]);
  });
  it('accepts max depth and rejects deeper', () => {
    expect(ok('['.repeat(MAX_DEPTH) + ']'.repeat(MAX_DEPTH)).maxDepth).toBe(MAX_DEPTH);
    const e = err('['.repeat(MAX_DEPTH + 1) + ']'.repeat(MAX_DEPTH + 1));
    expect(e.message).toContain('nesting depth');
  });
  it('has the object type for objects', () => {
    expect(ok('{}').type[0]).toBe(T_OBJECT);
  });
});

describe('parser: errors with exact positions', () => {
  const cases: [string, string, number, number][] = [
    ['', 'Unexpected end of input', 1, 1],
    ['[1,2', 'Unexpected end of input', 1, 5],
    ['{"a":1,}', 'Trailing comma is not allowed', 1, 8],
    ['[1,]', 'Trailing comma is not allowed', 1, 4],
    ['{"a":1 "b":2}', "Expected ',' or '}' after object member", 1, 8],
    ['[1 2]', "Expected ',' or ']' after array element", 1, 4],
    ['{"a" 1}', "Expected ':' after object key", 1, 6],
    ['{a:1}', 'Expected property name in double quotes', 1, 2],
    ['"a\\xb"', 'Invalid escape sequence \\x', 1, 3],
    ['"a\\u12G4"', 'Invalid unicode escape sequence \\u', 1, 3],
    ['"abc', 'Unterminated string', 1, 1],
    ['"a\nb"', 'Invalid control character in string', 1, 3],
    ['[1]\n x', 'Unexpected content after end of document', 2, 2],
    ['[01]', "Expected ',' or ']' after array element", 1, 3],
    ['[1.]', 'Invalid number: expected digits after decimal point', 1, 2],
    ['[1e]', 'Invalid number: expected digits in exponent', 1, 2],
    ['[-]', 'Invalid number', 1, 2],
    ['[tru]', "Unexpected token 't'", 1, 2],
    ['{\n  "a": ,\n}', "Unexpected ',': expected a value", 2, 8],
    ['[NaN]', "Unexpected token 'N'", 1, 2],
  ];
  it.each(cases)('%j -> %s', (text, message, line, column) => {
    const e = err(text);
    expect(e.message).toBe(message);
    expect([e.line, e.column]).toEqual([line, column]);
  });
});
