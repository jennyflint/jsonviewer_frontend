import { Check, Copy, Trash2 } from 'lucide-solid';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { api } from '../../lib/api/endpoints';
import type { ShareCreated } from '../../lib/api/endpoints';
import { auth } from '../../stores/auth';
import { addLocalShare, localShares, removeLocalShare } from '../../stores/localShares';
import { copyText } from '../../lib/clipboard';
import { MAX_DOCUMENT_BYTES, PUBLIC_URL, utf8Size } from '../../lib/files';
import { errorMessage, fmtDate, fmtSize, t } from '../../lib/i18n';
import { toast } from '../../stores/toasts';
import { setLastSavedAt } from '../../stores/historySync';

type Expiry = '1h' | '1d' | '7d' | '30d' | 'never';

export function shareLink(res: Pick<ShareCreated, 'slug' | 'url'>): string {
  if (res.url && /^https?:\/\//.test(res.url)) return res.url;
  return `${PUBLIC_URL || location.origin}/s/${res.slug}`;
}

export function ShareDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: 'single' | 'compare';
  content: string;
  contentRight?: string;
  defaultTitle?: string;
}) {
  const [title, setTitle] = createSignal('');
  const [expiry, setExpiry] = createSignal<Expiry>('7d');
  const [toHistory, setToHistory] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [created, setCreated] = createSignal<(ShareCreated & { link: string }) | null>(null);
  const [copied, setCopied] = createSignal(false);
  const authed = () => auth.status === 'authenticated';

  createEffect(() => {
    if (props.open) {
      setCreated(null);
      setError(null);
      setCopied(false);
      setTitle(props.defaultTitle ?? '');
      if (!authed() && expiry() === 'never') setExpiry('7d');
    }
  });

  const tooLarge = () =>
    utf8Size(props.content) > MAX_DOCUMENT_BYTES ||
    (props.contentRight !== undefined && utf8Size(props.contentRight) > MAX_DOCUMENT_BYTES);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (tooLarge()) {
      setError(t('error.document_too_large'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.createShare({
        kind: props.kind,
        title: title().trim() || undefined,
        content: props.content,
        content_right: props.kind === 'compare' ? props.contentRight : undefined,
        expires_in: expiry(),
        save_to_history: authed() && toHistory(),
      });
      const link = shareLink(res);
      setCreated({ ...res, link });
      if (res.delete_token) {
        addLocalShare({
          slug: res.slug,
          title: title().trim() || null,
          created_at: res.created_at,
          expires_at: res.expires_at ?? null,
          delete_token: res.delete_token,
        });
      }
      if (authed() && toHistory()) {
        setLastSavedAt(Date.now());
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const c = created();
    if (!c) return;
    const ok = await copyText(c.link);
    setCopied(ok);
    if (!ok) toast.error(t('copy.failed'));
  };

  const removeShare = async (slug: string, token: string) => {
    try {
      await api.deleteShare(slug, token);
    } catch (err) {
      // already expired / deleted: forget it locally either way
      if (!(err instanceof Error && 'status' in err && (err as { status: number }).status === 404)) {
        toast.error(errorMessage(err));
        return;
      }
    }
    removeLocalShare(slug);
    toast.success(t('share.deleted'));
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.kind === 'compare' ? t('share.title_compare') : t('share.title')}
      description={t('share.description')}
    >
      <Show
        when={created()}
        fallback={
          <form class="space-y-3" onSubmit={submit}>
            <label class="block text-sm">
              {t('share.doc_title')}
              <input
                class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2"
                maxLength={200}
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder={t('share.doc_title_placeholder')}
              />
            </label>
            <div class="text-sm">
              <label class="block">
                {t('share.expires')}
                <div class="mt-1">
                  <Select
                    label={t('share.expires')}
                    value={expiry()}
                    onChange={(v) => setExpiry(v)}
                    options={[
                      { value: '1h', label: t('share.exp_1h') },
                      { value: '1d', label: t('share.exp_1d') },
                      { value: '7d', label: t('share.exp_7d') },
                      { value: '30d', label: t('share.exp_30d') },
                      { value: 'never', label: t('share.exp_never'), disabled: !authed() },
                    ]}
                  />
                </div>
              </label>
              <Show when={!authed()}>
                <p class="mt-1 text-xs text-muted">{t('share.never_requires_auth')}</p>
              </Show>
            </div>
            <Show when={authed()}>
              <Toggle checked={toHistory()} onChange={setToHistory} label={t('share.save_history')} />
            </Show>
            <p class="text-xs text-muted">
              {t('share.size', {
                size: fmtSize(
                  utf8Size(props.content) + (props.contentRight ? utf8Size(props.contentRight) : 0),
                ),
              })}
            </p>
            <Show when={!authed()}>
              <p class="rounded-md bg-surface-2 p-2 text-xs text-muted">{t('share.token_notice')}</p>
            </Show>
            <Show when={error() || tooLarge()}>
              <p class="rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
                {error() ?? t('error.document_too_large')}
              </p>
            </Show>
            <div class="flex justify-end gap-2">
              <Button onClick={() => props.onOpenChange(false)}>{t('common.cancel')}</Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy() || tooLarge() || props.content.trim() === ''}
              >
                {busy() ? t('common.loading') : t('share.create')}
              </Button>
            </div>
          </form>
        }
      >
        {(c) => (
          <div class="space-y-3">
            <p class="text-sm font-medium text-ok">{t('share.created')}</p>
            <div class="flex gap-2">
              <input
                readOnly
                aria-label={t('share.link')}
                class="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 font-mono text-xs"
                value={c().link}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="primary" onClick={() => void copy()}>
                {copied() ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied() ? t('copy.copied') : t('share.copy_link')}
              </Button>
            </div>
            <p class="text-xs text-muted">
              {c().expires_at
                ? t('share.expires_on', { date: fmtDate(c().expires_at) })
                : t('share.never_expires')}
            </p>
            <div class="flex justify-end">
              <Button onClick={() => props.onOpenChange(false)}>{t('common.close')}</Button>
            </div>
          </div>
        )}
      </Show>

      <Show when={localShares().length > 0}>
        <div class="mt-4 border-t border-border pt-3">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('share.my_shares')}
          </h3>
          <ul class="max-h-40 space-y-1 overflow-auto">
            <For each={localShares()}>
              {(s) => (
                <li class="flex items-center gap-2 text-sm">
                  <a
                    class="min-w-0 flex-1 truncate text-accent underline"
                    href={`/s/${s.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.title || s.slug}
                  </a>
                  <span class="shrink-0 text-xs text-muted">
                    {s.expires_at ? fmtDate(s.expires_at) : t('share.never_expires')}
                  </span>
                  <button
                    class="rounded p-1 text-danger hover:bg-danger-soft"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                    onClick={() => void removeShare(s.slug, s.delete_token)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </Dialog>
  );
}
