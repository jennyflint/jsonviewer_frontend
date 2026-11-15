/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { duplicateKeyNodes } from '../json/access';
import { AnalysisError, analyzeModel } from '../json/duplicates';
import type { DuplicateOptions, DuplicatesResponse } from '../json/duplicates';
import { minify, pretty, sortKeys } from '../json/format';
import type { Indent } from '../json/format';
import { modelBuffers, parseJson } from '../json/parser';
import type { JsonModel, ParseError } from '../json/parser';
import { searchModel } from '../json/search';
import type { SearchOptions, SearchResult } from '../json/search';

export interface ParseStats {
  nodes: number;
  depth: number;
  bytes: number;
  ms: number;
}
export type WorkerParse =
  | { ok: true; model: JsonModel; stats: ParseStats; dupNodes: Int32Array }
  | { ok: false; error: ParseError; stats: ParseStats };
export type DuplicatesResult =
  { ok: true; result: DuplicatesResponse } | { ok: false; code: string; message: string };
export type FormatResult = { ok: true; text: string } | { ok: false; error: ParseError };

let cached: { text: string; model: JsonModel } | null = null;

function modelFor(text: string): ReturnType<typeof parseJson> {
  if (cached && cached.text === text) return { ok: true, model: cached.model };
  return parseJson(text);
}

const api = {
  parse(text: string): WorkerParse {
    const t0 = performance.now();
    const r = parseJson(text);
    const bytes = new TextEncoder().encode(text).length;
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { ok: false, error: r.error, stats: { nodes: 0, depth: 0, bytes, ms } };
    cached = { text, model: r.model };
    // The cached model keeps its own buffers: transfer copies so both threads can use them.
    const copy: JsonModel = {
      ...r.model,
      type: r.model.type.slice(),
      parent: r.model.parent.slice(),
      firstChild: r.model.firstChild.slice(),
      nextSibling: r.model.nextSibling.slice(),
      childCount: r.model.childCount.slice(),
      subtreeEnd: r.model.subtreeEnd.slice(),
      depth: r.model.depth.slice(),
      ord: r.model.ord.slice(),
      start: r.model.start.slice(),
      end: r.model.end.slice(),
      keyStart: r.model.keyStart.slice(),
      keyEnd: r.model.keyEnd.slice(),
      lineStarts: r.model.lineStarts.slice(),
    };
    const dupNodes = Int32Array.from(duplicateKeyNodes(r.model));
    const res: WorkerParse = {
      ok: true,
      model: copy,
      dupNodes,
      stats: { nodes: r.model.count, depth: r.model.maxDepth, bytes, ms: Math.round(performance.now() - t0) },
    };
    return Comlink.transfer(res, [...modelBuffers(copy), dupNodes.buffer as ArrayBuffer]);
  },
  format(text: string, indent: Indent): FormatResult {
    const r = modelFor(text);
    return r.ok ? { ok: true, text: pretty(r.model, indent) } : { ok: false, error: r.error };
  },
  minify(text: string): FormatResult {
    const r = modelFor(text);
    return r.ok ? { ok: true, text: minify(r.model) } : { ok: false, error: r.error };
  },
  sortKeys(text: string, indent: Indent): FormatResult {
    const r = modelFor(text);
    return r.ok ? { ok: true, text: sortKeys(r.model, indent) } : { ok: false, error: r.error };
  },
  /** Searches the most recently parsed document. */
  search(query: string, opts: SearchOptions): SearchResult {
    if (!cached) return { ok: true, ids: new Int32Array(0) };
    const r = searchModel(cached.model, query, opts);
    return r.ok ? Comlink.transfer(r, [r.ids.buffer as ArrayBuffer]) : r;
  },
  duplicates(text: string, options: Partial<DuplicateOptions>): DuplicatesResult {
    const r = modelFor(text);
    if (!r.ok) {
      return {
        ok: true,
        result: {
          valid: false,
          parse_error: { message: r.error.message, line: r.error.line, column: r.error.column },
          stats: { nodes: 0, depth: 0, elapsed_ms: 0 },
          duplicate_keys: [],
          duplicate_values: [],
          duplicate_subtrees: [],
          duplicates_by_field: null,
          truncated: false,
        },
      };
    }
    try {
      return { ok: true, result: analyzeModel(r.model, options) };
    } catch (e) {
      if (e instanceof AnalysisError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  },
};

export type JsonWorkerApi = typeof api;
Comlink.expose(api);
