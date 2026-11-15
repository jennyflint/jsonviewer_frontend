import { useNavigate } from '@solidjs/router';
import { For, Show, createResource } from 'solid-js';
import { Trash2 } from 'lucide-solid';
import { AuthGuard } from '../components/layout/AuthGuard';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Spinner';
import { api } from '../lib/api/endpoints';
import { auth, bumpAuthEpoch, clearUser } from '../stores/auth';
import { confirmAction } from '../stores/confirm';
import { toast } from '../stores/toasts';
import { errorMessage, fmtDate, t } from '../lib/i18n';
import { providerLabel } from '../components/layout/UserMenu';
import { SettingsForm } from '../components/layout/SettingsForm';

function Account() {
  const navigate = useNavigate();
  const [sessions, { refetch }] = createResource(() => api.sessions());

  const revoke = async (id: string) => {
    try {
      await api.revokeSession(id);
      toast.success(t('account.revoked'));
      void refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const revokeOthers = async () => {
    try {
      await api.revokeOtherSessions();
      toast.success(t('account.revoked_others'));
      void refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const deleteAccount = async () => {
    const ok = await confirmAction({
      title: t('account.delete_confirm_title'),
      message: t('account.delete_text'),
      confirmLabel: t('account.delete'),
      danger: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    try {
      await api.deleteAccount();
      clearUser();
      bumpAuthEpoch((v) => v + 1);
      toast.success(t('account.deleted'));
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const card = 'rounded-xl border border-border bg-surface p-4';
  return (
    <div class="mx-auto h-full max-w-3xl space-y-4 overflow-auto p-4">
      <h1 class="text-xl font-semibold">{t('account.title')}</h1>
      <section class={card} aria-label={t('account.profile')}>
        <h2 class="mb-2 font-semibold">{t('account.profile')}</h2>
        <div class="flex items-center gap-3">
          <Show when={auth.user?.avatar_url}>
            <img
              src={auth.user?.avatar_url as string}
              alt=""
              width="48"
              height="48"
              class="h-12 w-12 rounded-full"
              referrerpolicy="no-referrer"
            />
          </Show>
          <div class="min-w-0">
            <div class="font-medium">{auth.user?.name ?? '—'}</div>
            <div class="truncate text-sm text-muted">{auth.user?.email ?? '—'}</div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span class="text-xs text-muted">{t('account.providers')}:</span>
              <For each={auth.user?.providers ?? []}>
                {(p) => <span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{providerLabel(p)}</span>}
              </For>
            </div>
          </div>
        </div>
      </section>

      <section class={card} aria-label={t('account.settings')}>
        <h2 class="mb-2 font-semibold">{t('account.settings')}</h2>
        <SettingsForm />
      </section>

      <section class={card} aria-label={t('account.sessions')}>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-semibold">{t('account.sessions')}</h2>
          <Button size="sm" onClick={() => void revokeOthers()} disabled={(sessions()?.length ?? 0) < 2}>
            {t('account.revoke_others')}
          </Button>
        </div>
        <Show when={!sessions.loading} fallback={<Skeleton class="h-12 w-full" />}>
          <Show when={sessions.error}>
            <p class="text-sm text-danger" role="alert">
              {errorMessage(sessions.error)}
            </p>
          </Show>
          <ul class="divide-y divide-border">
            <For each={sessions()}>
              {(s) => (
                <li class="flex items-center gap-3 py-2 text-sm">
                  <div class="min-w-0 flex-1">
                    <div class="truncate" title={s.user_agent ?? ''}>
                      {s.user_agent ?? '—'}
                    </div>
                    <div class="text-xs text-muted">
                      {s.ip ?? '—'} · {t('account.last_seen', { date: fmtDate(s.last_seen_at) })}
                    </div>
                  </div>
                  <Show
                    when={s.current}
                    fallback={
                      <Button size="sm" onClick={() => void revoke(s.id)}>
                        {t('account.revoke')}
                      </Button>
                    }
                  >
                    <span class="rounded-full bg-ok-soft px-2 py-0.5 text-xs text-ok">
                      {t('account.current')}
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <section class={`${card} border-danger/50`} aria-label={t('account.danger')}>
        <h2 class="mb-1 font-semibold text-danger">{t('account.danger')}</h2>
        <p class="mb-3 text-sm text-muted">{t('account.delete_text')}</p>
        <Button variant="danger" onClick={() => void deleteAccount()}>
          <Trash2 size={14} /> {t('account.delete')}
        </Button>
      </section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AuthGuard what="account" returnTo="/account">
      <Account />
    </AuthGuard>
  );
}
