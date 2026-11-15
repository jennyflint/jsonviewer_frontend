import { describe, expect, it } from 'vitest';
import { makePatch } from './patch';

describe('patch', () => {
  it('creates a unified diff with the left/right file names', () => {
    const p = makePatch('{\n  "a": 1\n}', '{\n  "a": 2\n}');
    expect(p).toContain('--- left.json');
    expect(p).toContain('+++ right.json');
    expect(p).toContain('-  "a": 1');
    expect(p).toContain('+  "a": 2');
  });
  it('is empty of hunks when equal', () => {
    expect(makePatch('[1]', '[1]')).not.toContain('@@');
  });
});
