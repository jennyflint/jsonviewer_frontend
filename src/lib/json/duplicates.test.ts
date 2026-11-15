import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeText, AnalysisError, arrayCandidates } from './duplicates';
import { parseJson } from './parser';

const read = (n: string) => readFileSync(resolve(process.cwd(), 'src/test/fixtures', n), 'utf8');
const fixture = read('dups.json');
const strip = (r: ReturnType<typeof analyzeText>) => {
  const { stats: _s, ...rest } = r;
  return { ...rest, duplicate_subtrees: rest.duplicate_subtrees.map(({ hash: _h, ...g }) => g) };
};

describe('duplicates', () => {
  const res = analyzeText(fixture);
  it('finds duplicate keys with positions', () => {
    expect(res.valid).toBe(true);
    expect(res.duplicate_keys).toHaveLength(1);
    const k = res.duplicate_keys[0]!;
    expect(k.object_path).toBe('$');
    expect(k.key).toBe('dup');
    expect(k.occurrences.map((o) => [o.line, o.column, o.value_preview])).toEqual([
      [14, 3, '1'],
      [15, 3, '2'],
    ]);
  });
  it('groups duplicate values (shadowed duplicate-key values are ignored)', () => {
    const byType = (t: string) => res.duplicate_values.filter((v) => v.type === t);
    expect(byType('boolean')).toEqual([
      { type: 'boolean', value: true, count: 2, paths: ['$.flag', '$.other'] },
    ]);
    expect(byType('null')[0]?.paths).toEqual(['$.nothing', '$.n1']);
    const num = byType('number').find((v) => v.value === 1)!;
    expect(num.count).toBeGreaterThanOrEqual(3); // 1, 1.0, id:1 ... "dup":1 is shadowed
    expect(num.lexemes).toContain('1.0');
    expect(byType('string').find((v) => v.value === 'user')?.count).toBe(3);
  });
  it('groups duplicate subtrees and suppresses nested repeats', () => {
    const s = res.duplicate_subtrees;
    expect(s.some((g) => g.paths.join() === '$.users[0].tags,$.users[1].tags')).toBe(true);
    const nested = analyzeText('{"a":{"x":{"k":1,"j":2}},"b":{"x":{"k":1,"j":2}}}');
    expect(nested.duplicate_subtrees).toHaveLength(1);
    expect(nested.duplicate_subtrees[0]!.paths).toEqual(['$.a', '$.b']);
    const elsewhere = analyzeText('{"a":{"x":{"k":1,"j":2}},"b":{"x":{"k":1,"j":2}},"c":{"k":1,"j":2}}');
    expect(elsewhere.duplicate_subtrees.map((g) => g.paths.length)).toEqual([3, 2]);
  });
  it('ignores key order in subtrees', () => {
    const r = analyzeText('[{"a":1,"b":2},{"b":2,"a":1}]');
    expect(r.duplicate_subtrees[0]?.count).toBe(2);
  });
  it('applies filters', () => {
    const r = analyzeText(fixture, {
      value_types: ['boolean'],
      min_occurrences: 2,
      subtrees: false,
      keys: false,
    });
    expect(r.duplicate_values.every((v) => v.type === 'boolean')).toBe(true);
    expect(r.duplicate_keys).toEqual([]);
    expect(
      analyzeText('["ab","ab","c","c"]', { min_string_length: 2 }).duplicate_values.map((v) => v.value),
    ).toEqual(['ab']);
    expect(analyzeText('[1,1,1]', { min_occurrences: 4 }).duplicate_values).toEqual([]);
    expect(analyzeText('[[1],[1]]', { min_subtree_size: 3 }).duplicate_subtrees).toEqual([]);
  });
  it('groups by field', () => {
    const r = analyzeText(fixture, { by_field: { array_path: '$.users', field: 'id' } });
    expect(r.duplicates_by_field).toEqual({
      array_path: '$.users',
      field: 'id',
      groups: [{ value: 2, indices: [1, 2] }],
      missing: 0,
    });
    const miss = analyzeText(fixture, { by_field: { array_path: '$.users', field: 'name' } });
    expect(miss.duplicates_by_field?.missing).toBe(1);
  });
  it('rejects bad array paths', () => {
    expect(() => analyzeText(fixture, { by_field: { array_path: '$.flag', field: 'id' } })).toThrow(
      AnalysisError,
    );
    expect(() => analyzeText(fixture, { by_field: { array_path: '$.nope', field: 'id' } })).toThrow(
      /does not exist/,
    );
    expect(() => analyzeText(fixture, { by_field: { array_path: 'users', field: 'id' } })).toThrow(
      /start with/,
    );
  });
  it('truncates at max_groups', () => {
    const doc = JSON.stringify(Array.from({ length: 10 }, (_, i) => [`s${i}`, `s${i}`]).flat());
    const r = analyzeText(doc, { max_groups: 3 });
    expect(r.duplicate_values).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });
  it('reports parse errors', () => {
    const r = analyzeText('{"a":');
    expect(r.valid).toBe(false);
    expect(r.parse_error?.message).toBe('Unexpected end of input');
  });
  it('lists array candidates', () => {
    const p = parseJson(fixture);
    if (!p.ok) throw new Error();
    expect(arrayCandidates(p.model)[0]).toEqual({ path: '$.users', fields: ['id', 'name', 'role', 'tags'] });
  });
  it('matches the snapshot fixture (kept in sync with the backend)', () => {
    expect(strip(res)).toEqual(JSON.parse(read('dups.expected.json')));
  });
});
