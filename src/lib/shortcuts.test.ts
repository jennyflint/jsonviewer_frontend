import { describe, expect, it } from 'vitest';
import { matches } from './shortcuts';

const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('shortcuts', () => {
  it('matches mod combinations with ctrl or meta', () => {
    expect(
      matches(ev({ key: 'F', ctrlKey: true, shiftKey: true }), { key: 'f', mod: true, shift: true }),
    ).toBe(true);
    expect(
      matches(ev({ key: 'f', metaKey: true, shiftKey: true }), { key: 'f', mod: true, shift: true }),
    ).toBe(true);
    expect(matches(ev({ key: 'f', ctrlKey: true }), { key: 'f', mod: true, shift: true })).toBe(false);
    expect(matches(ev({ key: 's', ctrlKey: true }), { key: 's', mod: true })).toBe(true);
  });
  it('matches alt arrows and ?', () => {
    expect(matches(ev({ key: 'ArrowDown', altKey: true }), { key: 'ArrowDown', alt: true })).toBe(true);
    expect(matches(ev({ key: 'ArrowDown' }), { key: 'ArrowDown', alt: true })).toBe(false);
    expect(matches(ev({ key: '?', shiftKey: true }), { key: '?' })).toBe(true);
  });
});
