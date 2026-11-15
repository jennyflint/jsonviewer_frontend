import { describe, expect, it } from 'vitest';
import { duplicatesToCsv } from './duplicates-export';
import { analyzeText } from './duplicates';

describe('duplicates csv', () => {
  it('exports all categories and escapes formulas / quotes', () => {
    const r = analyzeText('{"a":"=cmd","b":"=cmd","c":"x,\\"y\\"","d":"x,\\"y\\"","z":1,"z":2}');
    const csv = duplicatesToCsv(r);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('category,item,count,locations');
    expect(csv).toContain('key,$ z,2,1:');
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"x,""y"""');
  });
});
