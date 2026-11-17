import { ArrowDown, ArrowUp, Download, ClipboardCopy, Share2 } from '../../lib/icons';
import { Show, createMemo, createSignal } from 'solid-js';
import { Button, IconButton } from '../ui/Button';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { SplitPane } from '../ui/SplitPane';
import { DiffView } from './DiffView';
import type { DiffApi } from './DiffView';
import { ChangeList } from './ChangeList';
import type { CompareResult } from '../../lib/workers/diff.worker';
import type { Change } from '../../lib/json/diff';
import { makePatch } from '../../lib/json/patch';
import { downloadText } from '../../lib/files';
import { copyText } from '../../lib/clipboard';
import { settings, updateSettings } from '../../stores/settings';
import { toast } from '../../stores/toasts';
import { useShortcuts } from '../../lib/shortcuts';
import { fmtNumber, t } from '../../lib/i18n';

/** Git-style proportion bar: 5 blocks coloured by additions / deletions. */
function StatBar(props: { add: number; del: number }) {
  const blocks = () => {
    const total = props.add + props.del;
    if (!total) return ['n', 'n', 'n', 'n', 'n'];
    const a = Math.round((props.add / total) * 5);
    const aa = props.add > 0 ? Math.max(1, a) : 0;
    const dd = props.del > 0 ? Math.max(1, 5 - aa) : 0;
    return Array.from({ length: 5 }, (_, i) => (i < aa ? 'a' : i < aa + dd ? 'd' : 'n'));
  };
  return (
    <span class="inline-flex gap-0.5" aria-hidden="true">
      {blocks().map((b) => (
        <span
          class="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: b === 'a' ? 'var(--ok)' : b === 'd' ? 'var(--danger)' : 'var(--border)' }}
        />
      ))}
    </span>
  );
}

/** Stats, navigation, diff view, change list and exports for one comparison result. */
export function CompareResultView(props: {
  result: CompareResult;
  left: string;
  right: string;
  onShare?: () => void;
  navKeys?: boolean;
  ignoreWhitespace?: boolean;
}) {
  let api: DiffApi | undefined;
  const [chunks, setChunks] = createSignal(0);
  const [active, setActive] = createSignal(-1);
  const [collapse, setCollapse] = createSignal(true);
  const stats = () => props.result.stats;
  const changeCount = () => stats().added + stats().removed + stats().changed;
  const identical = () =>
    props.result.errors.length === 0 &&
    stats().additions === 0 &&
    stats().deletions === 0 &&
    props.result.changes.length === 0;

  const step = (d: number) => {
    if (!chunks()) return;
    api?.goToChunk(active() < 0 ? (d > 0 ? 0 : -1) : active() + d);
  };
  useShortcuts([
    { key: 'ArrowDown', alt: true, when: () => props.navKeys !== false, handler: () => step(1) },
    { key: 'ArrowUp', alt: true, when: () => props.navKeys !== false, handler: () => step(-1) },
  ]);

  const select = (c: Change) => {
    if (c.rightLine) api?.scrollToLine('right', c.rightLine);
    if (c.leftLine) api?.scrollToLine('left', c.leftLine);
  };

  const patch = () =>
    makePatch(props.result.leftNormalized, props.result.rightNormalized, {
      context: settings.diffContextLines,
      ignoreWhitespace: !!props.ignoreWhitespace,
    });

  const left = createMemo(() => props.result.leftNormalized);
  const right = createMemo(() => props.result.rightNormalized);

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-3 py-1.5">
        <span class="inline-flex items-center gap-2 text-sm font-medium" data-testid="compare-stats">
          <StatBar add={stats().additions} del={stats().deletions} />
          <span class="text-ok">+{fmtNumber(stats().additions)}</span>
          <span class="text-danger">−{fmtNumber(stats().deletions)}</span>
          <span class="text-muted">
            {t('compare.stats', {
              add: fmtNumber(stats().additions),
              del: fmtNumber(stats().deletions),
              chg: fmtNumber(changeCount()),
            })}
          </span>
        </span>
        <Show when={props.result.raw}>
          <span class="rounded bg-warn-soft px-2 py-0.5 text-xs text-warn">{t('compare.raw_mode')}</span>
        </Show>
        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <Select
            label={t('compare.view_split')}
            class="!h-7 text-xs"
            value={settings.diffView}
            options={[
              { value: 'split', label: t('compare.view_split') },
              { value: 'unified', label: t('compare.view_unified') },
            ]}
            onChange={(v) => updateSettings({ diffView: v })}
          />
          <Toggle
            checked={collapse()}
            onChange={setCollapse}
            label={<span class="text-xs">{t('compare.collapse_unchanged')}</span>}
          />
          <Select
            label={t('compare.context_lines')}
            class="!h-7 text-xs"
            value={settings.diffContextLines}
            options={[0, 1, 3, 5, 10].map((n) => ({
              value: n,
              label: `${t('compare.context_lines')}: ${n}`,
            }))}
            onChange={(n) => updateSettings({ diffContextLines: n })}
          />
          <IconButton
            label={t('compare.prev') + ' (Alt+↑)'}
            size="sm"
            onClick={() => step(-1)}
            disabled={!chunks()}
          >
            <ArrowUp size={14} />
          </IconButton>
          <IconButton
            label={t('compare.next') + ' (Alt+↓)'}
            size="sm"
            onClick={() => step(1)}
            disabled={!chunks()}
          >
            <ArrowDown size={14} />
          </IconButton>
          <span class="min-w-[9ch] text-xs text-muted" aria-live="polite" data-testid="change-counter">
            {chunks()
              ? t('compare.change_of', { i: Math.max(active(), -1) + 1 || '–', n: chunks() })
              : t('compare.no_change_nav')}
          </span>
          <Button size="sm" onClick={() => downloadText('changes.patch', patch(), 'text/x-diff')}>
            <Download size={12} /> {t('compare.download_patch')}
          </Button>
          <Button
            size="sm"
            onClick={async () =>
              toast.success(
                (await copyText(JSON.stringify(props.result.changes, null, 2)))
                  ? t('compare.copied_changes')
                  : t('copy.failed'),
              )
            }
          >
            <ClipboardCopy size={12} /> {t('compare.copy_changes')}
          </Button>
          <Show when={props.onShare}>
            <Button size="sm" variant="primary" onClick={() => props.onShare?.()}>
              <Share2 size={12} /> {t('compare.share')}
            </Button>
          </Show>
        </div>
      </div>
      <Show when={identical()}>
        <p class="border-b border-border bg-ok-soft px-3 py-1.5 text-sm text-ok" role="status">
          {t('compare.no_changes')}
        </p>
      </Show>
      <div class="min-h-0 flex-1">
        <SplitPane
          initial={74}
          left={
            <DiffView
              left={left()}
              right={right()}
              mode={settings.diffView}
              contextLines={settings.diffContextLines}
              collapse={collapse()}
              ignoreWhitespace={!!props.ignoreWhitespace}
              apiRef={(a) => (api = a)}
              onChunks={(n) => {
                setChunks(n);
                setActive(-1);
              }}
              onActiveChunk={setActive}
            />
          }
          right={<ChangeList changes={props.result.changes} onSelect={select} />}
        />
      </div>
    </div>
  );
}
