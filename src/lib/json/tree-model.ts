/**
 * Visible-row list for a virtualized tree. Rows are node ids in pre-order, so they are always sorted
 * ascending, which allows binary search and contiguous range splices on expand / collapse.
 */
import { ancestors, isContainer } from './access';
import type { JsonModel } from './parser';

export class VisibleRows {
  rows: Int32Array = new Int32Array(0);
  length = 0;
  readonly expanded = new Set<number>();

  /** `root` makes the list show only that subtree ("focus on this branch"). */
  constructor(
    private m: JsonModel,
    readonly root = 0,
  ) {
    this.rebuild();
  }

  /** Rebuild from the expanded set (root is always shown). */
  rebuild(): void {
    const m = this.m;
    const out: number[] = [];
    if (m.count > 0) {
      let id = this.root;
      const stop = m.subtreeEnd[this.root] as number;
      while (id < stop) {
        out.push(id);
        if (isContainer(m, id) && this.expanded.has(id) && (m.childCount[id] as number) > 0) id++;
        else id = m.subtreeEnd[id] as number;
      }
    }
    this.rows = Int32Array.from(out);
    this.length = out.length;
  }

  indexOf(id: number): number {
    let lo = 0;
    let hi = this.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.rows[mid] as number;
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  private lowerBound(id: number): number {
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.rows[mid] as number) < id) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private visibleDescendants(id: number): number[] {
    const m = this.m;
    const out: number[] = [];
    const end = m.subtreeEnd[id] as number;
    let c = id + 1;
    while (c < end) {
      out.push(c);
      if (isContainer(m, c) && this.expanded.has(c) && (m.childCount[c] as number) > 0) c++;
      else c = m.subtreeEnd[c] as number;
    }
    return out;
  }

  private splice(at: number, remove: number, insert: number[]): void {
    const tail = this.rows.slice(at + remove, this.length);
    const newLen = this.length - remove + insert.length;
    const next =
      newLen > this.rows.length ? new Int32Array(Math.max(newLen, this.rows.length * 2)) : this.rows;
    if (next !== this.rows) next.set(this.rows.subarray(0, at));
    for (let i = 0; i < insert.length; i++) next[at + i] = insert[i] as number;
    next.set(tail, at + insert.length);
    this.rows = next;
    this.length = newLen;
  }

  isExpanded(id: number): boolean {
    return this.expanded.has(id);
  }

  expand(id: number): void {
    const m = this.m;
    if (!isContainer(m, id) || (m.childCount[id] as number) === 0 || this.expanded.has(id)) return;
    this.expanded.add(id);
    const idx = this.indexOf(id);
    if (idx >= 0) this.splice(idx + 1, 0, this.visibleDescendants(id));
  }

  collapse(id: number): void {
    if (!this.expanded.has(id)) return;
    this.expanded.delete(id);
    const idx = this.indexOf(id);
    if (idx < 0) return;
    const end = this.lowerBound(this.m.subtreeEnd[id] as number);
    this.splice(idx + 1, end - (idx + 1), []);
  }

  toggle(id: number): void {
    if (this.expanded.has(id)) this.collapse(id);
    else this.expand(id);
  }

  expandAll(): void {
    for (let id = this.root; id < (this.m.subtreeEnd[this.root] as number); id++)
      if (isContainer(this.m, id) && (this.m.childCount[id] as number) > 0) this.expanded.add(id);
    this.rebuild();
  }

  collapseAll(): void {
    this.expanded.clear();
    this.rebuild();
  }

  /** Expand containers with depth < level (so that nodes up to depth `level` are visible). */
  expandToLevel(level: number): void {
    this.expanded.clear();
    const base = this.m.depth[this.root] as number;
    for (let id = this.root; id < (this.m.subtreeEnd[this.root] as number); id++) {
      if (isContainer(this.m, id) && (this.m.depth[id] as number) < base + level) this.expanded.add(id);
    }
    this.rebuild();
  }

  /** Expand or collapse a node's whole subtree. */
  setRecursive(id: number, open: boolean): void {
    const end = this.m.subtreeEnd[id] as number;
    for (let c = id; c < end; c++) {
      if (!isContainer(this.m, c) || (this.m.childCount[c] as number) === 0) continue;
      if (open) this.expanded.add(c);
      else this.expanded.delete(c);
    }
    this.rebuild();
  }

  /** Expand all ancestors of `id` so that it becomes visible. Returns whether anything changed. */
  reveal(id: number): boolean {
    let changed = false;
    for (const a of ancestors(this.m, id).slice(0, -1)) {
      if (!this.expanded.has(a)) {
        this.expanded.add(a);
        changed = true;
      }
    }
    if (changed) this.rebuild();
    return changed;
  }

  /** Rows restricted to the given nodes and their ancestors ("filter to matches"). */
  static filtered(m: JsonModel, matches: Iterable<number>): Int32Array {
    const keep = new Set<number>();
    for (const id of matches) for (const a of ancestors(m, id)) keep.add(a);
    return Int32Array.from([...keep].sort((a, b) => a - b));
  }
}
