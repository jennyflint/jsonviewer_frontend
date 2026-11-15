import { afterEach, describe, expect, it, vi } from 'vitest';
import { getItem, getJSON, removeItem, setItem, setJSON } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('storage wrapper', () => {
  it('round-trips values', () => {
    expect(setItem('k', 'v')).toBe(true);
    expect(getItem('k')).toBe('v');
    expect(setJSON('j', { a: [1] })).toBe(true);
    expect(getJSON('j', null)).toEqual({ a: [1] });
    removeItem('k');
    expect(getItem('k')).toBeNull();
  });
  it('returns fallbacks for missing / corrupt JSON', () => {
    expect(getJSON('nope', 5)).toBe(5);
    localStorage.setItem('bad', '{oops');
    expect(getJSON('bad', 'fb')).toBe('fb');
  });
  it('refuses values over the size cap', () => {
    expect(setItem('big', 'x'.repeat(100), 50)).toBe(false);
    expect(getItem('big')).toBeNull();
  });
  it('survives a localStorage that throws on every access', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(getItem('a')).toBeNull();
    expect(setItem('a', 'b')).toBe(false);
    expect(() => removeItem('a')).not.toThrow();
    expect(getJSON('a', 1)).toBe(1);
    expect(setJSON('a', {})).toBe(false);
  });
  it('survives an inaccessible localStorage getter', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getItem('a')).toBeNull();
    expect(setItem('a', 'b')).toBe(false);
  });
  it('handles quota errors', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    });
    expect(setItem('a', 'b')).toBe(false);
  });
});
