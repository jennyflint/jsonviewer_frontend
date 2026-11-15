/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { diffLines } from 'diff';
import { structuralDiff, normalizeSide } from '../json/diff';
import type { Change, DiffOptions } from '../json/diff';
import { parseJson } from '../json/parser';
import type { ParseError } from '../json/parser';

export interface SideError {
  side: 'left' | 'right';
  error: ParseError;
}

export interface CompareResult {
  leftNormalized: string;
  rightNormalized: string;
  changes: Change[];
  stats: { added: number; removed: number; changed: number; additions: number; deletions: number };
  errors: SideError[];
  /** True when at least one side was invalid and raw text was compared instead. */
  raw: boolean;
}

function lineStats(a: string, b: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const p of diffLines(a, b)) {
    if (p.added) additions += p.count ?? 0;
    else if (p.removed) deletions += p.count ?? 0;
  }
  return { additions, deletions };
}

const api = {
  compare(left: string, right: string, opts: DiffOptions, allowRaw = false): CompareResult {
    const l = parseJson(left);
    const r = parseJson(right);
    const errors: SideError[] = [];
    if (!l.ok) errors.push({ side: 'left', error: l.error });
    if (!r.ok) errors.push({ side: 'right', error: r.error });
    if (!l.ok || !r.ok) {
      const lt = allowRaw ? left : '';
      const rt = allowRaw ? right : '';
      return {
        leftNormalized: lt,
        rightNormalized: rt,
        changes: [],
        errors,
        raw: allowRaw,
        stats: {
          added: 0,
          removed: 0,
          changed: 0,
          ...(allowRaw ? lineStats(lt, rt) : { additions: 0, deletions: 0 }),
        },
      };
    }
    const ln = normalizeSide(l.model, opts);
    const rn = normalizeSide(r.model, opts);
    const changes = structuralDiff(l.model, r.model, opts, ln.lines, rn.lines);
    const stats = {
      added: changes.filter((c) => c.kind === 'added').length,
      removed: changes.filter((c) => c.kind === 'removed').length,
      changed: changes.filter((c) => c.kind === 'changed' || c.kind === 'type_changed' || c.kind === 'moved')
        .length,
      ...lineStats(ln.text, rn.text),
    };
    return { leftNormalized: ln.text, rightNormalized: rn.text, changes, stats, errors: [], raw: false };
  },
};

export type DiffWorkerApi = typeof api;
Comlink.expose(api);
