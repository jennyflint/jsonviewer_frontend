import { describe, expect, it } from 'vitest';
import { en } from './en';
import { uk } from './uk';
import { translate, fmtRelative, errorMessage, fmtSize } from './index';
import { ApiError } from '../api/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('i18n', () => {
  it('uk and en have exactly the same keys', () => {
    expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort());
  });
  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(uk[k]), k).toBe(ph(en[k]));
  });
  it('every t() key used in the source exists', () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
          for (const m of readFileSync(p, 'utf8').matchAll(/\bt\('([a-z_.0-9]+)'/g)) used.add(m[1] as string);
      }
    };
    walk(join(process.cwd(), 'src'));
    for (const k of used) expect(k in en, k).toBe(true);
  });
  it('interpolates params', () => {
    expect(translate('en', 'status.line_col', { line: 3, col: 9 })).toBe('Ln 3, Col 9');
    expect(translate('uk', 'status.line_col', { line: 3, col: 9 })).toContain('3');
  });
  it('maps every documented backend error code to a message', () => {
    const codes = [
      'auth_required',
      'forbidden',
      'oauth_cancelled',
      'oauth_failed',
      'share_not_found',
      'never_requires_auth',
      'document_too_large',
      'invalid_content',
      'nesting_too_deep',
      'invalid_url',
      'blocked_destination',
      'dns_resolution_failed',
      'upstream_timeout',
      'upstream_error',
      'too_many_redirects',
      'fetch_too_large',
      'invalid_array_path',
      'analysis_timeout',
      'rate_limited',
      'network_error',
      'validation_error',
      'internal_error',
    ];
    for (const c of codes) expect(`error.${c}` in en, c).toBe(true);
  });
  it('errorMessage: known code, unknown code fallback, retry-after', () => {
    expect(errorMessage(new ApiError(422, 'blocked_destination', 'raw'))).toContain('not allowed');
    expect(errorMessage(new ApiError(418, 'teapot', 'I am a teapot'))).toBe('I am a teapot');
    expect(errorMessage(new ApiError(429, 'rate_limited', 'x', undefined, undefined, 30))).toContain('30');
    expect(errorMessage(new Error('plain'))).toBe('plain');
  });
  it('formats sizes and relative dates', () => {
    expect(fmtSize(512)).toContain('B');
    expect(fmtSize(2048)).toContain('KB');
    expect(fmtSize(5 * 1024 * 1024)).toContain('MB');
    expect(fmtRelative(new Date(Date.now() - 3600_000))).toMatch(/hour|1/);
  });
});
