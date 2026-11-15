import { Show, createEffect, createSignal } from 'solid-js';
import { pendingConfirm, resolveConfirm } from '../../stores/confirm';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { t } from '../../lib/i18n';

/** Mounted once in the app shell; driven by `confirmAction()`. */
export function ConfirmHost() {
  const [typed, setTyped] = createSignal('');
  createEffect(() => {
    pendingConfirm();
    setTyped('');
  });
  return (
    <Show when={pendingConfirm()}>
      {(p) => (
        <Dialog
          open
          onOpenChange={(o) => !o && resolveConfirm(false)}
          title={p().title}
          footer={
            <>
              <Button onClick={() => resolveConfirm(false)}>{t('common.cancel')}</Button>
              <Button
                variant={p().danger ? 'danger' : 'primary'}
                disabled={!!p().requireText && typed() !== p().requireText}
                onClick={() => resolveConfirm(true)}
              >
                {p().confirmLabel ?? t('common.confirm')}
              </Button>
            </>
          }
        >
          <Show when={p().message}>
            <p class="text-sm">{p().message}</p>
          </Show>
          <Show when={p().requireText}>
            <label class="mt-3 block text-sm">
              {t('confirm.type_to_confirm', { text: p().requireText as string })}
              <input
                class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2"
                value={typed()}
                onInput={(e) => setTyped(e.currentTarget.value)}
                autofocus
              />
            </label>
          </Show>
        </Dialog>
      )}
    </Show>
  );
}
