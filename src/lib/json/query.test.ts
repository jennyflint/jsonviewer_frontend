import { describe, expect, it } from 'vitest';
import { parseJson } from './parser';
import { resolvePointer, runQuery } from './query';

const DOC =
  '{"users":[{"id":1,"name":"Ann","age":31},{"id":2,"name":"Bob","age":25},{"id":3,"name":"Cid","age":44}],"0":"zero"}';
const m = (() => {
  const r = parseJson(DOC);
  if (!r.ok) throw new Error();
  return r.model;
})();
const data = JSON.parse(DOC);

describe('queries', () => {
  it('JSONPath: filters, returns values and node paths', async () => {
    const r = await runQuery(m, data, 'jsonpath', '$.users[?(@.age>30)].name');
    expect(r).toMatchObject({ ok: true, count: 2 });
    if (!r.ok) return;
    expect(JSON.parse(r.text)).toEqual(['Ann', 'Cid']);
    expect(r.paths).toEqual(['$.users[0].name', '$.users[2].name']);
  });
  it('JSONPath: recursive descent and wildcard', async () => {
    const r = await runQuery(m, data, 'jsonpath', '$..id');
    expect(r.ok && JSON.parse(r.text)).toEqual([1, 2, 3]);
    const w = await runQuery(m, data, 'jsonpath', '$.users[*]');
    expect(w.ok && w.count).toBe(3);
  });
  it('JMESPath: projections and functions', async () => {
    const r = await runQuery(m, data, 'jmespath', 'users[?age > `30`].name');
    expect(r.ok && JSON.parse(r.text)).toEqual(['Ann', 'Cid']);
    const s = await runQuery(m, data, 'jmespath', 'sort_by(users, &age)[0].name');
    expect(s.ok && JSON.parse(s.text)).toBe('Bob');
    const n = await runQuery(m, data, 'jmespath', 'length(users)');
    expect(n.ok && n.count).toBe(1);
  });
  it('reports syntax errors instead of throwing', async () => {
    const r = await runQuery(m, data, 'jmespath', 'users[?');
    expect(r.ok).toBe(false);
    const p = await runQuery(m, data, 'jsonpath', '$[');
    expect(typeof p.ok).toBe('boolean'); // never throws
  });
  it('an empty expression yields an empty result', async () => {
    expect(await runQuery(m, data, 'jsonpath', '  ')).toMatchObject({ ok: true, count: 0 });
  });
  it('resolves pointers to node ids, telling array indexes from numeric keys', () => {
    expect(resolvePointer(m, '/users/1/name')).toBeGreaterThan(0);
    expect(resolvePointer(m, '/0')).toBeGreaterThan(0); // the "0" key of the root object
    expect(resolvePointer(m, '/users/9')).toBe(-1);
    expect(resolvePointer(m, '')).toBe(0);
  });
});
