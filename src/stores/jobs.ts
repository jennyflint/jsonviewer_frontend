import { createSignal } from 'solid-js';

export interface Job {
  id: number;
  label: string;
  startedAt: number;
  cancel: () => void;
}

const [jobs, setJobs] = createSignal<Job[]>([]);
export { jobs };
let seq = 0;

/** Show a long-running operation in the progress bar (with a Cancel button) while `fn` runs. */
export async function runJob<T>(label: string, cancel: () => void, fn: () => Promise<T>): Promise<T> {
  const id = ++seq;
  setJobs((l) => [...l, { id, label, startedAt: Date.now(), cancel }]);
  try {
    return await fn();
  } finally {
    setJobs((l) => l.filter((j) => j.id !== id));
  }
}

export function cancelJob(id: number): void {
  jobs()
    .find((j) => j.id === id)
    ?.cancel();
}
