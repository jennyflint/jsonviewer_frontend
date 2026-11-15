import { it, expect } from 'vitest';
import { analyzeText } from './duplicates';

/** Runs only against a live backend: BACKEND_URL=http://localhost:8000 pnpm test */
const BACKEND = process.env.BACKEND_URL;

const docs: [string, any][] = [
  ['{"a":{"x":{"k":1,"j":2}},"b":{"x":{"k":1,"j":2}},"c":{"k":1,"j":2}}', {}],
  [
    '[{"id":1,"v":"a"},{"id":1,"v":"b"},{"id":2,"v":"a"},{"v":"c"}]',
    { by_field: { array_path: '$', field: 'id' } },
  ],
  ['{"n":[1,1.0,1e0,2,2.5,2.50,"1",true,true,null,null],"s":["é","é","日本","日本"]}', {}],
  ['{"o":{"a":1,"a":2,"b":{"c":1,"c":1}},"p":[[1,2],[2,1],[1,2]]}', {}],
  ['{"users":[{"t":["x","y"]},{"t":["x","y"]},{"t":["y","x"]}]}', { min_subtree_size: 3 }],
  ['{"k":"ab","l":"ab","m":"c","n":"c"}', { min_string_length: 2 }],
  ['[1,1,1,1]', { min_occurrences: 3 }],
  ['{"a":[],"b":[],"c":{},"d":{}}', {}],
  ['{"a b":{"x":1,"y":1},"a.b":{"x":1,"y":1}}', {}],
];

const strip = (r: any) => ({
  ...r,
  stats: { nodes: r.stats.nodes, depth: r.stats.depth },
  duplicate_subtrees: r.duplicate_subtrees.map(({ hash: _h, ...g }: any) => g),
  duplicate_values: r.duplicate_values.map(({ lexemes: _l, ...g }: any) => g),
});

it.skipIf(!BACKEND)('duplicates parity with the live backend', async () => {
  for (const [content, options] of docs) {
    const res = await fetch(`${BACKEND}/api/analysis/duplicates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, options }),
    });
    const server = await res.json();
    const client = analyzeText(content, options);
    try {
      expect(strip(client)).toEqual(strip(server));
    } catch (e) {
      console.log('MISMATCH for', content, '\n', (e as Error).message.slice(0, 1500));
      throw e;
    }
  }
});
