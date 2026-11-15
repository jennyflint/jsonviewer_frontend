import { describe, expect, it } from 'vitest';
import { minify, pretty, sortKeys } from './format';
import { parseJson } from './parser';
import type { JsonModel } from './parser';

const m = (t: string): JsonModel => {
  const r = parseJson(t);
  if (!r.ok) throw new Error(r.error.message);
  return r.model;
};

describe('format', () => {
  it('pretty prints with 2, 4 and tab', () => {
    expect(pretty(m('{"a":[1,{"b":2}],"c":{}}'), 2)).toBe(
      '{\n  "a": [\n    1,\n    {\n      "b": 2\n    }\n  ],\n  "c": {}\n}',
    );
    expect(pretty(m('[1]'), 4)).toBe('[\n    1\n]');
    expect(pretty(m('{"a":[]}'), '\t')).toBe('{\n\t"a": []\n}');
  });
  it('minifies', () => {
    expect(minify(m('{ "a" : [ 1 , 2 ] ,\n "b" : { } }'))).toBe('{"a":[1,2],"b":{}}');
  });
  it('keeps exact numbers and escapes', () => {
    const src = '[12345678901234567890,0.1000000000000000055511151231257827,1E5,"\\u00e9\\n"]';
    expect(minify(m(src))).toBe(src);
  });
  it('keeps duplicate keys', () => {
    expect(minify(m('{"a":1,"a":2}'))).toBe('{"a":1,"a":2}');
    expect(minify(m('{"b":1,"a":2,"a":3}'))).toBe('{"b":1,"a":2,"a":3}');
    expect(sortKeys(m('{"b":1,"a":2,"a":3}'), 2)).toBe('{\n  "a": 2,\n  "a": 3,\n  "b": 1\n}');
  });
  it('format(minify(x)) == format(x)', () => {
    const x = '{ "z": [1, 2.50, {"k": null}], "a": "s", "e": [], "o": {} }';
    expect(pretty(m(minify(m(x))))).toBe(pretty(m(x)));
  });
  it('sorts keys recursively or only at the root', () => {
    const x = '{"b":{"z":1,"y":2},"a":1}';
    expect(minify(m(sortKeys(m(x), 2)))).toBe('{"a":1,"b":{"y":2,"z":1}}');
    expect(minify(m(sortKeys(m(x), 2, false)))).toBe('{"a":1,"b":{"z":1,"y":2}}');
  });
  it('sorts by code point like the backend', () => {
    expect(minify(m(sortKeys(m('{"\\uffff":1,"\\ud835\\udc9c":2}'), 2)))).toBe(
      '{"\\uffff":1,"\\ud835\\udc9c":2}',
    );
  });
});
