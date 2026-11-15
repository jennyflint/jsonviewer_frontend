import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, lisIndexes, normalizeSide, structuralDiff } from './diff';
import type { DiffOptions } from './diff';
import { parseJson } from './parser';
import type { JsonModel } from './parser';

const m = (t: string): JsonModel => {
  const r = parseJson(t);
  if (!r.ok) throw new Error(r.error.message);
  return r.model;
};
const run = (a: string, b: string, o: Partial<DiffOptions> = {}) => {
  const opts = { ...DEFAULT_DIFF_OPTIONS, ...o };
  const l = m(a);
  const r = m(b);
  const ln = normalizeSide(l, opts);
  const rn = normalizeSide(r, opts);
  return { changes: structuralDiff(l, r, opts, ln.lines, rn.lines), ln, rn };
};
const brief = (c: ReturnType<typeof run>['changes']) => c.map((x) => `${x.kind}:${x.path}`);

describe('structural diff', () => {
  it('detects added / removed / changed', () => {
    const { changes } = run('{"a":1,"b":2,"c":3}', '{"a":1,"b":5,"d":4}');
    expect(brief(changes).sort()).toEqual(['added:$.d', 'changed:$.b', 'removed:$.c']);
    expect(changes.find((c) => c.kind === 'changed')).toMatchObject({ oldValue: '2', newValue: '5' });
  });
  it('detects type changes', () => {
    expect(brief(run('{"a":1}', '{"a":"1"}').changes)).toEqual(['type_changed:$.a']);
    expect(brief(run('{"a":[]}', '{"a":{}}').changes)).toEqual(['type_changed:$.a']);
    expect(brief(run('{"a":true}', '{"a":false}').changes)).toEqual(['changed:$.a']);
  });
  it('treats 1 and 1.0 as equal and ignores key order', () => {
    expect(run('{"a":1,"b":2}', '{"b":2,"a":1.0}').changes).toEqual([]);
  });
  it('links changes to lines in the normalized texts', () => {
    const { changes, ln, rn } = run('{"z":1,"a":{"k":1}}', '{"z":1,"a":{"k":2}}');
    const c = changes[0]!;
    expect(ln.text.split('\n')[(c.leftLine ?? 0) - 1]).toContain('"k": 1');
    expect(rn.text.split('\n')[(c.rightLine ?? 0) - 1]).toContain('"k": 2');
  });
  it('sorts keys in normalized text when ignoreKeyOrder', () => {
    expect(run('{"b":1,"a":2}', '{"a":2,"b":1}').ln.text).toBe(run('{"b":1,"a":2}', '{"a":2,"b":1}').rn.text);
    expect(run('{"b":1,"a":2}', '{"a":2,"b":1}', { ignoreKeyOrder: false }).ln.text).not.toBe(
      run('{"b":1,"a":2}', '{"a":2,"b":1}', { ignoreKeyOrder: false }).rn.text,
    );
  });
  it('compares arrays by index by default', () => {
    expect(brief(run('[1,2,3]', '[1,9,3,4]').changes)).toEqual(['changed:$[1]', 'added:$[3]']);
    expect(brief(run('[1,2]', '[1]').changes)).toEqual(['removed:$[1]']);
  });
  it('ignoreArrayOrder', () => {
    expect(run('[1,2,3]', '[3,1,2]', { ignoreArrayOrder: true }).changes).toEqual([]);
    expect(brief(run('[1,2,3]', '[3,1,4]', { ignoreArrayOrder: true }).changes)).toEqual(['changed:$[2]']);
    const r = run('[1,2,3]', '[3,1,2]', { ignoreArrayOrder: true });
    expect(r.ln.text).toBe(r.rn.text);
  });
  it('arrayMatchKey matches by id, reports moves and field changes', () => {
    const a = '[{"id":1,"v":"a"},{"id":2,"v":"b"},{"id":3,"v":"c"}]';
    const b = '[{"id":3,"v":"c"},{"id":1,"v":"A"},{"id":4,"v":"d"}]';
    const k = brief(run(a, b, { arrayMatchKey: 'id' }).changes).sort();
    expect(k).toEqual(['added:$[2]', 'changed:$[1].v', 'moved:$[0]', 'removed:$[1]'].sort());
  });
  it('lis', () => {
    expect([...lisIndexes([2, 0, 1, 3])].sort()).toEqual([1, 2, 3]);
  });
});
