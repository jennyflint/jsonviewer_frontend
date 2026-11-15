import { batch, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { getJSON, setJSON } from '../lib/storage';
import { diffWorker, isStale } from '../lib/workers/clients';
import type { CompareResult } from '../lib/workers/diff.worker';
import { DEFAULT_DIFF_OPTIONS } from '../lib/json/diff';
import type { DiffOptions } from '../lib/json/diff';
import { settings } from './settings';
import { autosaveToHistory } from './historySync';

export type CompareStatus = 'idle' | 'running' | 'done' | 'error';
export const AUTO_COMPARE_MAX_CHARS = 1024 * 1024;
const KEY = 'jv.compare.v1';

interface CompareState {
  left: string;
  right: string;
  options: DiffOptions;
  result: CompareResult | null;
  status: CompareStatus;
  error: string | null;
  /** Text-diff chunk currently highlighted by the next/prev navigation. */
  activeChangeIndex: number;
  /** Compare the raw text when a side is invalid JSON. */
  rawFallback: boolean;
}

const saved = getJSON<{ left?: string; right?: string }>(KEY, {});

export const [compare, setCompare] = createStore<CompareState>({
  left: saved.left ?? '',
  right: saved.right ?? '',
  options: {
    ...DEFAULT_DIFF_OPTIONS,
    ignoreKeyOrder: settings.diffIgnoreKeyOrder,
    indent: typeof settings.indent === 'number' ? settings.indent : 2,
  },
  result: null,
  status: 'idle',
  error: null,
  activeChangeIndex: -1,
  rawFallback: false,
});

export const [resultRevision, bumpRevision] = createSignal(0);
/** Whether the Compare page shows the two editors or the diff result. */
export const [compareMode, setCompareMode] = createSignal<'input' | 'result'>('input');

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (compare.left.length + compare.right.length < 500_000)
      setJSON(KEY, { left: compare.left, right: compare.right });
  }, 800);
}

let autoTimer: ReturnType<typeof setTimeout> | undefined;

export async function runCompare(opts: { explicit?: boolean } = {}): Promise<void> {
  clearTimeout(autoTimer);
  if (compare.left.trim() === '' && compare.right.trim() === '') {
    batch(() => setCompare({ result: null, status: 'idle', error: null }));
    return;
  }
  setCompare({ status: 'running', error: null });
  try {
    const res = await diffWorker.call((w) =>
      w.compare(compare.left, compare.right, { ...compare.options }, compare.rawFallback),
    );
    batch(() => {
      setCompare({ result: res, status: 'done', activeChangeIndex: -1 });
      bumpRevision((v) => v + 1);
    });
    if (opts.explicit && res.errors.length === 0 && compare.left.trim())
      void autosaveToHistory(compare.left, 'compare');
  } catch (e) {
    if (!isStale(e)) setCompare({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

function scheduleAuto(): void {
  clearTimeout(autoTimer);
  if (compare.left.length + compare.right.length > AUTO_COMPARE_MAX_CHARS) return;
  autoTimer = setTimeout(() => void runCompare(), 400);
}

export function setSide(side: 'left' | 'right', text: string): void {
  setCompare(side, text);
  setCompare('rawFallback', false);
  persist();
  scheduleAuto();
}

export function swapSides(): void {
  const { left, right } = compare;
  batch(() => setCompare({ left: right, right: left }));
  persist();
  void runCompare();
}

export function clearCompare(): void {
  setCompare({
    left: '',
    right: '',
    result: null,
    status: 'idle',
    error: null,
    rawFallback: false,
    activeChangeIndex: -1,
  });
  persist();
}

export function setCompareOptions(patch: Partial<DiffOptions>): void {
  setCompare('options', patch);
  scheduleAuto();
}

export function useRawFallback(): void {
  setCompare('rawFallback', true);
  void runCompare();
}

/** Load both sides at once (history multi-select, shared comparison, "Open in Compare"). */
export function loadCompare(left: string, right: string): void {
  batch(() => setCompare({ left, right, rawFallback: false }));
  setCompareMode('result');
  persist();
  void runCompare();
}
