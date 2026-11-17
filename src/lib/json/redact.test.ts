import { describe, expect, it } from 'vitest';
import { DEFAULT_REDACT, redactModel } from './redact';
import { parseJson } from './parser';

const run = (text: string, over: Partial<typeof DEFAULT_REDACT> = {}) => {
  const r = parseJson(text);
  if (!r.ok) throw new Error(r.error.message);
  return redactModel(r.model, { ...DEFAULT_REDACT, ...over });
};

describe('redact', () => {
  it('replaces values of sensitive keys, keeping the formatting', () => {
    const r = run('{\n  "user": "ann",\n  "password": "hunter2",\n  "n": 1\n}');
    expect(r.text).toBe('{\n  "user": "ann",\n  "password": "***",\n  "n": 1\n}');
    expect(r.keyMatches).toBe(1);
  });
  it('matches inside key names, ignoring case and separators', () => {
    const r = run('{"userPassword":"a","API-Key":"b","access_token":"c","author":"d"}');
    expect(JSON.parse(r.text)).toEqual({
      userPassword: '***',
      'API-Key': '***',
      access_token: '***',
      author: 'd',
    });
    expect(r.keyMatches).toBe(3);
  });
  it('replaces whole objects and arrays under a sensitive key', () => {
    const r = run('{"secret":{"a":[1,2],"b":{"c":3}},"ok":[1]}');
    expect(JSON.parse(r.text)).toEqual({ secret: '***', ok: [1] });
    expect(r.keyMatches).toBe(1);
  });
  it('finds nested keys and keys inside arrays', () => {
    const r = run('{"a":[{"token":"x"},{"token":"y","id":1}]}');
    expect(JSON.parse(r.text)).toEqual({ a: [{ token: '***' }, { token: '***', id: 1 }] });
  });
  it('supports glob patterns and a custom replacement', () => {
    const r = run('{"x_internal":1,"y_internal":2,"z":3}', { keys: ['*_internal'], replacement: '[hidden]' });
    expect(JSON.parse(r.text)).toEqual({ x_internal: '[hidden]', y_internal: '[hidden]', z: 3 });
  });
  it('masks regex matches inside string values', () => {
    const r = run('{"note":"mail ann@example.com now","n":"x"}', {
      keys: [],
      valuePatterns: ['[\\w.]+@[\\w.]+'],
    });
    expect(JSON.parse(r.text).note).toBe('mail *** now');
    expect(r.valueMatches).toBe(1);
  });
  it('reports invalid regular expressions and changes nothing', () => {
    const r = run('{"a":1}', { valuePatterns: ['('] });
    expect(r.error).toBeTruthy();
    expect(r.text).toBe('{"a":1}');
  });
  it('keeps big numbers and duplicate keys untouched', () => {
    const r = run('{"a":12345678901234567890,"a":2,"password":"p"}');
    expect(r.text).toBe('{"a":12345678901234567890,"a":2,"password":"***"}');
  });
});
