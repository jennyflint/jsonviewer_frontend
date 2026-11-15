import { ArrowLeftRight, Eraser, GitCompare, Pencil } from 'lucide-solid';
import { Show, createSignal } from 'solid-js';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { CompareEditors } from '../components/compare/CompareEditors';
import { CompareResultView } from '../components/compare/CompareResultView';
import { DiffOptionsBar } from '../components/compare/DiffOptions';
import { ShareDialog } from '../components/dialogs/ShareDialog';
import {
  clearCompare,
  compare,
  compareMode,
  runCompare,
  setCompareMode,
  swapSides,
  useRawFallback,
} from '../stores/compare';
import { fmtNumber, t } from '../lib/i18n';

export default function ComparePage() {
  const [shareOpen, setShareOpen] = createSignal(false);
  const result = () => compare.result;
  const hasBoth = () => compare.left.trim() !== '' && compare.right.trim() !== '';
  const invalid = () => (result()?.errors.length ?? 0) > 0;

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div
        role="toolbar"
        aria-label={t('nav.compare')}
        class="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5"
      >
        <Button size="sm" onClick={swapSides}>
          <ArrowLeftRight size={14} /> {t('compare.swap')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!hasBoth()}
          onClick={() => {
            setCompareMode('result');
            void runCompare({ explicit: true });
          }}
        >
          <GitCompare size={14} /> {t('compare.run')}
        </Button>
        <Button size="sm" onClick={clearCompare}>
          <Eraser size={14} /> {t('compare.clear')}
        </Button>
        <Show when={compareMode() === 'result'}>
          <Button size="sm" onClick={() => setCompareMode('input')}>
            <Pencil size={14} /> {t('compare.back_to_input')}
          </Button>
        </Show>
        <Show when={compare.status === 'running'}>
          <Spinner label={t('compare.comparing')} />
        </Show>
        <Show when={compareMode() === 'input' && result() && !invalid()}>
          <button class="ml-2 text-sm text-accent underline" onClick={() => setCompareMode('result')}>
            {t('compare.stats', {
              add: fmtNumber(result()!.stats.additions),
              del: fmtNumber(result()!.stats.deletions),
              chg: fmtNumber(result()!.stats.added + result()!.stats.removed + result()!.stats.changed),
            })}
          </button>
        </Show>
      </div>
      <DiffOptionsBar />
      <div class="min-h-0 flex-1">
        <Show
          when={compareMode() === 'result' && result()}
          fallback={
            <Show when={compareMode() === 'result' && !result()} fallback={<CompareEditors />}>
              <p class="p-6 text-sm text-muted">
                {compare.status === 'running' ? t('compare.comparing') : t('compare.empty_hint')}
              </p>
            </Show>
          }
        >
          <Show
            when={!invalid() || result()!.raw}
            fallback={
              <div class="mx-auto max-w-xl space-y-3 p-6">
                {result()!.errors.map((e) => (
                  <p class="rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">
                    {t('compare.invalid_side', {
                      side: e.side === 'left' ? t('compare.side_left') : t('compare.side_right'),
                      message: e.error.message,
                      loc: t('status.line_col', { line: e.error.line, col: e.error.column }),
                    })}
                  </p>
                ))}
                <div class="flex gap-2">
                  <Button onClick={() => setCompareMode('input')}>
                    <Pencil size={14} /> {t('compare.back_to_input')}
                  </Button>
                  <Button variant="primary" onClick={useRawFallback}>
                    {t('compare.raw_fallback')}
                  </Button>
                </div>
              </div>
            }
          >
            <CompareResultView
              result={result()!}
              left={compare.left}
              right={compare.right}
              ignoreWhitespace={compare.options.ignoreWhitespace}
              onShare={() => setShareOpen(true)}
            />
          </Show>
        </Show>
      </div>
      <ShareDialog
        open={shareOpen()}
        onOpenChange={setShareOpen}
        kind="compare"
        content={compare.left}
        contentRight={compare.right}
      />
    </div>
  );
}
