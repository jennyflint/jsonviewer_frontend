import * as Comlink from 'comlink';
import { featureOn } from '../../stores/settings';
import type { DiffWorkerApi } from './diff.worker';
import type { JsonWorkerApi } from './json.worker';

export class StaleError extends Error {
  constructor() {
    super('Superseded by a newer request');
    this.name = 'StaleError';
  }
}

/** The user cancelled the running job (the worker was terminated). */
export class CancelledError extends StaleError {
  constructor() {
    super();
    this.message = 'Cancelled';
    this.name = 'CancelledError';
  }
}

/**
 * A lazily created worker whose calls are "latest wins": a call made while an older one is still
 * running makes the older one reject with StaleError. With `respawn`, the stale worker is terminated
 * (true cancellation of long jobs) and a fresh one is started for the next call.
 */
class WorkerClient<T> {
  private worker: Worker | null = null;
  private proxy: Comlink.Remote<T> | null = null;
  private seq = 0;
  private onceSeq = 0;
  private pending = new Map<number, (e: Error) => void>();

  constructor(
    private factory: () => Worker,
    private respawn: boolean,
    private init?: (api: Comlink.Remote<T>) => void,
  ) {}

  private ensure(): Comlink.Remote<T> {
    if (!this.proxy) {
      this.worker = this.factory();
      this.proxy = Comlink.wrap<T>(this.worker);
      this.init?.(this.proxy); // messages are ordered: runs before the first real call
    }
    return this.proxy;
  }

  async call<P extends PromiseLike<unknown>>(fn: (api: Comlink.Remote<T>) => P): Promise<Awaited<P>> {
    const id = ++this.seq;
    if (this.respawn && this.pending.size > 0) {
      for (const reject of this.pending.values()) reject(new StaleError());
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
      this.proxy = null;
    }
    const api = this.ensure();
    const result = await new Promise<Awaited<P>>((resolve, reject) => {
      this.pending.set(id, reject);
      fn(api).then((v) => resolve(v as Awaited<P>), reject);
    }).finally(() => this.pending.delete(id));
    if (id !== this.seq) throw new StaleError();
    return result;
  }

  /** Run a call without latest-wins semantics (e.g. one-off format actions). Cancellable. */
  async once<P extends PromiseLike<unknown>>(fn: (api: Comlink.Remote<T>) => P): Promise<Awaited<P>> {
    const id = ++this.onceSeq;
    const api = this.ensure();
    return new Promise<Awaited<P>>((resolve, reject) => {
      this.pending.set(-id, reject);
      fn(api).then(
        (v) => resolve(v as Awaited<P>),
        (e) => reject(e),
      );
    }).finally(() => this.pending.delete(-id));
  }

  /** Terminate the worker: every running call rejects with CancelledError. A fresh worker starts on the next call. */
  cancel(): void {
    for (const reject of this.pending.values()) reject(new CancelledError());
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.proxy = null;
  }
}

export const jsonWorker = new WorkerClient<JsonWorkerApi>(
  () => new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' }),
  false,
  (api) => void api.configure({ lenient: featureOn('json5') }),
);

export const diffWorker = new WorkerClient<DiffWorkerApi>(
  () => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }),
  true,
);

export const isStale = (e: unknown): e is StaleError => e instanceof StaleError;
export const isCancelled = (e: unknown): e is CancelledError => e instanceof CancelledError;
