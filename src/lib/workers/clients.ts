import * as Comlink from 'comlink';
import type { DiffWorkerApi } from './diff.worker';
import type { JsonWorkerApi } from './json.worker';

export class StaleError extends Error {
  constructor() {
    super('Superseded by a newer request');
    this.name = 'StaleError';
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
  private pending = new Map<number, (e: Error) => void>();

  constructor(
    private factory: () => Worker,
    private respawn: boolean,
  ) {}

  private ensure(): Comlink.Remote<T> {
    if (!this.proxy) {
      this.worker = this.factory();
      this.proxy = Comlink.wrap<T>(this.worker);
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

  /** Run a call without latest-wins semantics (e.g. one-off format actions). */
  async once<P extends PromiseLike<unknown>>(fn: (api: Comlink.Remote<T>) => P): Promise<Awaited<P>> {
    return (await fn(this.ensure())) as Awaited<P>;
  }
}

export const jsonWorker = new WorkerClient<JsonWorkerApi>(
  () => new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' }),
  false,
);

export const diffWorker = new WorkerClient<DiffWorkerApi>(
  () => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }),
  true,
);

export const isStale = (e: unknown): e is StaleError => e instanceof StaleError;
