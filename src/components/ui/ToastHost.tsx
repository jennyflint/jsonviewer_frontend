import { For } from 'solid-js';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-solid';
import { dismissToast, toasts } from '../../stores/toasts';
import { t } from '../../lib/i18n';

export function ToastHost() {
  return (
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(92vw,380px)] flex-col gap-2"
      aria-live="polite"
    >
      <For each={toasts()}>
        {(toast) => (
          <div
            role={toast.kind === 'error' ? 'alert' : 'status'}
            class="pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm shadow-lg"
          >
            <span
              class={
                toast.kind === 'error' ? 'text-danger' : toast.kind === 'success' ? 'text-ok' : 'text-accent'
              }
            >
              {toast.kind === 'error' ? (
                <AlertTriangle size={16} />
              ) : toast.kind === 'success' ? (
                <CheckCircle2 size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <div class="min-w-0 flex-1">
              <div class="break-words">{toast.message}</div>
              {toast.detail && <div class="mt-0.5 break-all text-xs text-muted">{toast.detail}</div>}
              {toast.action && (
                <button
                  class="mt-1 text-xs font-semibold text-accent underline"
                  onClick={() => {
                    toast.action?.run();
                    dismissToast(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              class="rounded p-0.5 text-muted hover:bg-surface-2"
              aria-label={t('common.dismiss')}
              title={t('common.dismiss')}
              onClick={() => dismissToast(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
