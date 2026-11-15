import { describe, expect, it } from 'vitest';
import { canonicalNumber, canonicalize, pyFloatRepr } from './canonical';
import { parseJson } from './parser';
import numbers from '../../test/fixtures/canonical-numbers.json';
import docs from '../../test/fixtures/canonical-docs.json';

describe('canonical', () => {
  it('sorts keys, drops whitespace, last duplicate wins', () => {
    const r = parseJson('{ "b": 1, "a": [1.0, 2], "b": 2 }');
    if (!r.ok) throw new Error();
    expect(canonicalize(r.model)).toBe('{"a":[1,2],"b":2}');
  });
  it('normalizes numbers', () => {
    expect(canonicalNumber('1.0')).toBe('1');
    expect(canonicalNumber('1e2')).toBe('100');
    expect(canonicalNumber('-0')).toBe('0');
    expect(canonicalNumber('12345678901234567890')).toBe('12345678901234567890');
  });
  it('python float repr', () => {
    expect(pyFloatRepr(1e-5)).toBe('1e-05');
    expect(pyFloatRepr(0.1)).toBe('0.1');
    expect(pyFloatRepr(1e22)).toBe('1e+22');
    expect(pyFloatRepr(1.5)).toBe('1.5');
  });
  it.each(Object.entries(numbers as Record<string, string>))(
    'number parity with backend: %s',
    (lex, expected) => {
      expect(canonicalNumber(lex)).toBe(expected);
    },
  );
  it.each(Object.entries(docs as Record<string, string>))(
    'document parity with backend: %s',
    (doc, expected) => {
      const r = parseJson(doc);
      if (!r.ok) throw new Error();
      expect(canonicalize(r.model)).toBe(expected);
    },
  );
});
