import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './safe-path';
import { formatBytes, utf8Size } from './files';
import { highlightText } from '../components/tree/highlight';

describe('safeReturnTo', () => {
  it('accepts relative paths only', () => {
    expect(safeReturnTo('/history?q=a')).toBe('/history?q=a');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
    expect(safeReturnTo('javascript:alert(1)')).toBe('/');
  });
});

describe('files helpers', () => {
  it('measures utf8 and formats bytes', () => {
    expect(utf8Size('é')).toBe(2);
    expect(formatBytes(1536, 'en-US')).toBe('1.5 KB');
  });
});

describe('highlightText', () => {
  it('returns the plain text when there is no query', () => {
    expect(highlightText('abc', '', { caseSensitive: false, regex: false }, false)).toBe('abc');
  });
});
