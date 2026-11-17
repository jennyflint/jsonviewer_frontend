import type { JsonModel } from './parser';

/** Duplicate-key count for the toolbar badge, computed from the parse result (no extra analysis needed). */
export function dupKeyGroupCount(dupNodes: Set<number>, getModel: () => JsonModel | null): number {
  const m = getModel();
  if (!m || dupNodes.size === 0) return 0;
  const seen = new Set<string>();
  for (const id of dupNodes)
    seen.add(`${m.parent[id]}|${m.text.slice(m.keyStart[id] as number, m.keyEnd[id] as number)}`);
  return seen.size;
}
