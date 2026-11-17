import { For, Show, createSignal, onCleanup } from 'solid-js';
import { Loader2, X } from '../../lib/icons';
import { cancelJob, jobs } from '../../stores/jobs';
import { featureOn } from '../../stores/settings';
import { t } from '../../lib/i18n';

/** Progress strip for long-running worker jobs: appears after a short delay, with elapsed time and Cancel. */
export function JobBar() {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 250);
  onCleanup(() => clearInterval(timer));
  const visible = () => (featureOn('progress') ? jobs().filter((j) => now() - j.startedAt > 400) : []);
  return (
    <Show when={visible().length > 0}>
      <div
        class="flex flex-col border-b border-border bg-accent-soft text-sm"
        role="status"
        aria-live="polite"
        data-testid="job-bar"
      >
        <For each={visible()}>
          {(j) => (
            <div class="flex items-center gap-2 px-3 py-1">
              <Loader2 size={14} class="animate-spin text-accent" aria-hidden="true" />
              <span class="font-medium">{j.label}</span>
              <span class="text-xs text-muted">
                {t('job.elapsed', { s: Math.max(1, Math.round((now() - j.startedAt) / 1000)) })}
              </span>
              <button
                class="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs hover:bg-surface-2"
                onClick={() => cancelJob(j.id)}
              >
                <X size={12} /> {t('common.cancel')}
              </button>
            </div>
          )}
        </For>
        <div class="h-0.5 w-full overflow-hidden bg-border">
          <div class="job-indeterminate h-full w-1/3 bg-accent" />
        </div>
      </div>
    </Show>
  );
}
