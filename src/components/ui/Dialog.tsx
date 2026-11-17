import { Dialog as K } from '@kobalte/core/dialog';
import { X } from '../../lib/icons';
import type { JSX, ParentProps } from 'solid-js';
import { t } from '../../lib/i18n';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  wide?: boolean;
  footer?: JSX.Element;
}

/** Accessible modal: focus trap, Esc to close and focus returns to the trigger (handled by Kobalte). */
export function Dialog(props: ParentProps<DialogProps>) {
  return (
    <K open={props.open} onOpenChange={props.onOpenChange}>
      <K.Portal>
        <K.Overlay class="dlg-overlay" />
        <div class="dlg-pos">
          <K.Content class={`dlg-content ${props.wide ? 'wide' : ''}`}>
            <div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <K.Title class="text-base font-semibold">{props.title}</K.Title>
                {props.description && (
                  <K.Description class="mt-0.5 text-sm text-muted">{props.description}</K.Description>
                )}
              </div>
              <K.CloseButton
                class="rounded p-1 text-muted hover:bg-surface-2"
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X size={16} />
              </K.CloseButton>
            </div>
            <div class="px-4 py-3">{props.children}</div>
            {props.footer && (
              <div class="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                {props.footer}
              </div>
            )}
          </K.Content>
        </div>
      </K.Portal>
    </K>
  );
}
