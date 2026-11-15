import type { DuplicatesResponse } from './duplicates';

function csvCell(v: unknown): string {
  const s = typeof v === 'string' ? v : (JSON.stringify(v) ?? '');
  // neutralize spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Flat CSV report: category,key_or_value,count,locations. */
export function duplicatesToCsv(r: DuplicatesResponse): string {
  const rows: unknown[][] = [['category', 'item', 'count', 'locations']];
  for (const k of r.duplicate_keys)
    rows.push([
      'key',
      `${k.object_path} ${k.key}`,
      k.occurrences.length,
      k.occurrences.map((o) => `${o.line}:${o.column}`).join(' | '),
    ]);
  for (const v of r.duplicate_values) rows.push([`value:${v.type}`, v.value, v.count, v.paths.join(' | ')]);
  for (const s of r.duplicate_subtrees)
    rows.push([`subtree:${s.kind}`, s.preview, s.count, s.paths.join(' | ')]);
  if (r.duplicates_by_field) {
    for (const g of r.duplicates_by_field.groups)
      rows.push([
        `field:${r.duplicates_by_field.array_path}.${r.duplicates_by_field.field}`,
        g.value,
        g.indices.length,
        g.indices.join(' | '),
      ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
