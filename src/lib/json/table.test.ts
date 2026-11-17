import { describe, expect, it } from 'vitest';
import { parseJson } from './parser';
import { cellText, filterRows, isTableArray, nearestTableArray, sortRows, tableInfo, toCsv } from './table';

const doc = (t: string) => {
  const r = parseJson(t);
  if (!r.ok) throw new Error();
  return r.model;
};
const M = doc(
  '{"users":[{"id":10,"name":"Bob","tags":["a"]},{"id":2,"name":"ann"},{"name":"Cid","id":"x"},{"id":3,"extra":{"k":1}}]}',
);

describe('table view helpers', () => {
  it('detects arrays of records and the nearest one for any selected node', () => {
    expect(isTableArray(M, 1)).toBe(true);
    expect(isTableArray(M, 0)).toBe(false);
    expect(nearestTableArray(M, 1)).toBe(1);
    expect(nearestTableArray(M, 3)).toBe(1); // a cell inside a row
    expect(nearestTableArray(M, 0)).toBe(-1);
  });
  it('collects columns in order of first appearance', () => {
    const t = tableInfo(M, 1);
    expect(t.columns).toEqual(['id', 'name', 'tags', 'extra']);
    expect(t.rows).toHaveLength(4);
  });
  it('renders cell text: strings decoded, containers summarized, missing empty', () => {
    const t = tableInfo(M, 1);
    expect(cellText(M, t.rows[0]!, 'name')).toBe('Bob');
    expect(cellText(M, t.rows[0]!, 'tags')).toBe('[1]');
    expect(cellText(M, t.rows[1]!, 'tags')).toBe('');
    expect(cellText(M, t.rows[3]!, 'extra')).toBe('{1}');
  });
  it('sorts numerically when both are numbers, as text otherwise, empty cells last', () => {
    const t = tableInfo(M, 1);
    const ids = (rows: number[]) => rows.map((r) => cellText(M, r, 'id'));
    expect(ids(sortRows(M, t.rows, 'id', 1))).toEqual(['2', '3', '10', 'x']);
    expect(ids(sortRows(M, t.rows, 'id', -1))).toEqual(['x', '10', '3', '2']);
    expect(sortRows(M, t.rows, 'tags', 1).at(-1)).not.toBe(t.rows[0]); // rows without "tags" go last
    expect(sortRows(M, t.rows, 'name', 1).map((r) => cellText(M, r, 'name'))).toEqual([
      'ann',
      'Bob',
      'Cid',
      '',
    ]);
  });
  it('filters globally or by column, case-insensitively', () => {
    const t = tableInfo(M, 1);
    expect(filterRows(M, t.rows, t.columns, 'AN')).toHaveLength(1);
    expect(filterRows(M, t.rows, t.columns, 'x')).toHaveLength(1); // id "x"
    expect(filterRows(M, t.rows, t.columns, 'b', 'name')).toHaveLength(1);
    expect(filterRows(M, t.rows, t.columns, '')).toBe(t.rows);
  });
  it('exports CSV with quoting', () => {
    const m = doc('[{"a":"x,y","b":1},{"a":"q\\"t","b":null}]');
    const t = tableInfo(m, 0);
    expect(toCsv(m, t.rows, t.columns)).toBe('a,b\r\n"x,y",1\r\n"q""t",null\r\n');
  });
  it('shows primitives of mixed arrays in a (value) column', () => {
    const m = doc('[{"a":1}, 5, "s"]');
    const t = tableInfo(m, 0);
    expect(t.columns).toEqual(['(value)', 'a']);
    expect(cellText(m, t.rows[1]!, '(value)')).toBe('5');
  });
});
