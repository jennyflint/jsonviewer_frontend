import { describe, expect, it } from 'vitest';
import { buildPath, parsePath, resolvePath, segmentsToPath } from './path';
import { parseJson } from './parser';
import type { JsonModel } from './parser';

const m = (t: string): JsonModel => {
  const r = parseJson(t);
  if (!r.ok) throw new Error('bad');
  return r.model;
};

describe('path', () => {
  const doc = m(
    '{"users":[{"email":"a"},{},{},{"email":"z"}],"first name":1,"a.b":[7],"$x":2,"0":3,"q\\"":4}',
  );
  it('matches the backend format (parity examples)', () => {
    expect(buildPath(doc, 0)).toBe('$');
    const ids = new Map<string, number>();
    for (let i = 0; i < doc.count; i++) ids.set(buildPath(doc, i), i);
    expect(ids.has('$.users[3].email')).toBe(true);
    expect(ids.has('$["first name"]')).toBe(true);
    expect(ids.has('$["a.b"][0]')).toBe(true);
    expect(ids.has('$.$x')).toBe(true);
    expect(ids.has('$["0"]')).toBe(true);
    expect(ids.has('$["q\\""]')).toBe(true);
  });
  it('round-trips build/parse/resolve for every node', () => {
    for (let i = 0; i < doc.count; i++) expect(resolvePath(doc, buildPath(doc, i))).toBe(i);
  });
  it('parses segments', () => {
    expect(parsePath('$.a[2]["x y"]')).toEqual(['a', 2, 'x y']);
    expect(segmentsToPath(['a', 2, 'x y'])).toBe('$.a[2]["x y"]');
    expect(parsePath('a.b')).toBeNull();
    expect(parsePath('$.')).toBeNull();
    expect(parsePath('$[')).toBeNull();
  });
  it('resolves duplicate keys to the last member and fails softly', () => {
    const d = m('{"a":1,"a":2}');
    expect(resolvePath(d, '$.a')).toBe(2);
    expect(resolvePath(d, '$.zz')).toBe(-1);
    expect(resolvePath(d, '$[0]')).toBe(-1);
  });
});
