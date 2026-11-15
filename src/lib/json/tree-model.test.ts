import { describe, expect, it } from 'vitest';
import { VisibleRows } from './tree-model';
import { parseJson } from './parser';
import { searchModel } from './search';
import { duplicateKeyNodes } from './access';
import type { JsonModel } from './parser';

const m = (t: string): JsonModel => {
  const r = parseJson(t);
  if (!r.ok) throw new Error(r.error.message);
  return r.model;
};
const doc = m('{"a":[1,2,{"b":3}],"c":{"d":4},"e":5}'); // ids: 0 root,1 a,2,3,4 obj,5 b,6 c,7 d,8 e

describe('VisibleRows', () => {
  it('starts with the root only and expands incrementally', () => {
    const v = new VisibleRows(doc);
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual([0]);
    v.expand(0);
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual([0, 1, 6, 8]);
    v.expand(1);
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual([0, 1, 2, 3, 4, 6, 8]);
    v.expand(4);
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
    v.collapse(1);
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual([0, 1, 6, 8]);
    v.expand(1); // remembers that 4 was expanded
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
  });
  it('incremental updates equal a rebuild', () => {
    const v = new VisibleRows(doc);
    for (const id of [0, 6, 1, 4, 1, 6]) v.toggle(id);
    const inc = Array.from(v.rows.subarray(0, v.length));
    v.rebuild();
    expect(Array.from(v.rows.subarray(0, v.length))).toEqual(inc);
  });
  it('expandAll / collapseAll / expandToLevel / reveal / recursive', () => {
    const v = new VisibleRows(doc);
    v.expandAll();
    expect(v.length).toBe(9);
    v.collapseAll();
    expect(v.length).toBe(1);
    v.expandToLevel(1);
    expect(v.length).toBe(4);
    v.collapseAll();
    expect(v.reveal(5)).toBe(true);
    expect(v.indexOf(5)).toBeGreaterThan(-1);
    v.setRecursive(1, false);
    expect(v.indexOf(5)).toBe(-1);
  });
  it('filters to matches and ancestors', () => {
    expect(Array.from(VisibleRows.filtered(doc, [7]))).toEqual([0, 6, 7]);
  });
  it('scales to many rows', () => {
    const big = m('[' + Array.from({ length: 200000 }, (_, i) => i).join(',') + ']');
    const v = new VisibleRows(big);
    v.expand(0);
    expect(v.length).toBe(200001);
  });
});

describe('search', () => {
  const d = m('{"Name":"Alice","tags":["x","alice2"],"n":42}');
  it('searches keys and values', () => {
    const r = searchModel(d, 'alice', { keys: true, values: true, caseSensitive: false, regex: false });
    expect(r.ok && Array.from(r.ids)).toEqual([1, 4]);
    const k = searchModel(d, 'name', { keys: true, values: false, caseSensitive: false, regex: false });
    expect(k.ok && Array.from(k.ids)).toEqual([1]);
    const cs = searchModel(d, 'alice', { keys: true, values: true, caseSensitive: true, regex: false });
    expect(cs.ok && Array.from(cs.ids)).toEqual([4]);
    const re = searchModel(d, '^\\d+$', { keys: false, values: true, caseSensitive: false, regex: true });
    expect(re.ok && Array.from(re.ids)).toEqual([5]);
    expect(searchModel(d, '(', { keys: true, values: true, caseSensitive: false, regex: true }).ok).toBe(
      false,
    );
  });
  it('finds duplicate key nodes', () => {
    expect([...duplicateKeyNodes(m('{"a":1,"a":2,"b":3}'))]).toEqual([1, 2]);
  });
});
