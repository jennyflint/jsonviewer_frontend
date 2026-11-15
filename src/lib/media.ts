import { createSignal, onCleanup } from 'solid-js';

/** Reactive `matchMedia` signal. */
export function createMediaQuery(query: string): () => boolean {
  let mq: MediaQueryList | null = null;
  try {
    mq = window.matchMedia(query);
  } catch {
    /* no matchMedia (tests) */
  }
  const [matches, setMatches] = createSignal(mq?.matches ?? false);
  if (mq) {
    const on = () => setMatches(mq!.matches);
    mq.addEventListener('change', on);
    onCleanup(() => mq?.removeEventListener('change', on));
  }
  return matches;
}

export const createIsMobile = () => createMediaQuery('(max-width: 767px)');
