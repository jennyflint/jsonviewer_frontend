/** Table view of an array of objects: columns, cell text, sorting, filtering and CSV export. */
import { children, childByKey, decodeToken, isContainer, keyOf, previewValue, raw } from './access';
import { csvCell } from './duplicates-export';
import { T_ARRAY, T_NUMBER, T_OBJECT, T_STRING } from './parser';
import type { JsonModel } from './parser';

export const MAX_COLUMNS = 80;
export const VALUE_COLUMN = '(value)';

export interface TableInfo {
  arrayId: number;
  /** Element node ids in document order. */
  rows: number[];
  columns: string[];
}

/** An array that has at least one object element (the usual "list of records"). */
export function isTableArray(m: JsonModel, id: number): boolean {
  if (id < 0 || (m.type[id] as number) !== T_ARRAY) return false;
  for (let c = m.firstChild[id] as number, n = 0; c >= 0 && n < 50; c = m.nextSibling[c] as number, n++) {
    if ((m.type[c] as number) === T_OBJECT) return true;
  }
  return false;
}

/** The array to show for a selected node: the node itself, or the closest ancestor array of records. */
export function nearestTableArray(m: JsonModel, id: number): number {
  for (let c = id; c >= 0; c = m.parent[c] as number) if (isTableArray(m, c)) return c;
  return -1;
}

export function tableInfo(m: JsonModel, arrayId: number, scan = 500): TableInfo {
  const rows = children(m, arrayId);
  const cols = new Map<string, true>();
  let hasValues = false;
  for (const r of rows.slice(0, scan)) {
    if ((m.type[r] as number) === T_OBJECT) {
      for (
        let c = m.firstChild[r] as number;
        c >= 0 && cols.size < MAX_COLUMNS;
        c = m.nextSibling[c] as number
      )
        cols.set(keyOf(m, c) as string, true);
    } else hasValues = true;
  }
  const columns = [...cols.keys()];
  if (hasValues) columns.unshift(VALUE_COLUMN);
  return { arrayId, rows, columns };
}

/** The node holding a cell's value, or -1. */
export function cellNode(m: JsonModel, row: number, col: string): number {
  if (col === VALUE_COLUMN) return (m.type[row] as number) === T_OBJECT ? -1 : row;
  return (m.type[row] as number) === T_OBJECT ? childByKey(m, row, col) : -1;
}

export function cellText(m: JsonModel, row: number, col: string): string {
  const n = cellNode(m, row, col);
  if (n < 0) return '';
  const t = m.type[n] as number;
  if (t === T_STRING) return decodeToken(raw(m, n));
  return previewValue(m, n, 200);
}

const num = (m: JsonModel, n: number) => ((m.type[n] as number) === T_NUMBER ? Number(raw(m, n)) : NaN);

/** Stable sort by a column: numbers numerically, everything else as text; empty cells last. */
export function sortRows(m: JsonModel, rows: number[], col: string, dir: 1 | -1): number[] {
  const keyed = rows.map((r, i) => {
    const n = cellNode(m, r, col);
    return { r, i, n, v: n >= 0 ? num(m, n) : NaN, s: cellText(m, r, col) };
  });
  keyed.sort((a, b) => {
    if (a.n < 0 || b.n < 0) return a.n < 0 && b.n < 0 ? a.i - b.i : a.n < 0 ? 1 : -1;
    const c =
      !Number.isNaN(a.v) && !Number.isNaN(b.v)
        ? a.v - b.v
        : a.s.localeCompare(b.s, undefined, { numeric: true, sensitivity: 'base' });
    return c !== 0 ? c * dir : a.i - b.i;
  });
  return keyed.map((k) => k.r);
}

/** Rows where any column's text contains `q` (case-insensitive), or only in `col` when given. */
export function filterRows(
  m: JsonModel,
  rows: number[],
  columns: string[],
  q: string,
  col?: string,
): number[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  const cols = col ? [col] : columns;
  return rows.filter((r) => cols.some((c) => cellText(m, r, c).toLowerCase().includes(needle)));
}

export function toCsv(m: JsonModel, rows: number[], columns: string[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      columns
        .map((c) => {
          const n = cellNode(m, r, c);
          if (n >= 0 && isContainer(m, n)) return csvCell(raw(m, n).replace(/\s+/g, ' '));
          return csvCell(cellText(m, r, c));
        })
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
