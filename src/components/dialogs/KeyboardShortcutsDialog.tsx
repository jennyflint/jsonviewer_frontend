import { For } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { SHORTCUT_DOCS, modLabel } from '../../lib/shortcuts';
import { t } from '../../lib/i18n';

export function KeyboardShortcutsDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={t('shortcuts.title')}>
      <table class="w-full text-sm">
        <tbody>
          <For each={SHORTCUT_DOCS}>
            {(s) => (
              <tr class="border-b border-border last:border-0">
                <td class="py-2 pr-4">{t(s.action)}</td>
                <td class="py-2 text-right">
                  <kbd class="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                    {s.keys.replaceAll('Mod', modLabel())}
                  </kbd>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Dialog>
  );
}
