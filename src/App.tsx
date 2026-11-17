import { Route, Router } from '@solidjs/router';
import type { RouteSectionProps } from '@solidjs/router';
import { ErrorBoundary, Suspense, createSignal, lazy, onMount } from 'solid-js';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { JobBar } from './components/ui/JobBar';
import { ToastHost } from './components/ui/ToastHost';
import { ConfirmHost } from './components/dialogs/ConfirmDialog';
import { KeyboardShortcutsDialog } from './components/dialogs/KeyboardShortcutsDialog';
import { Skeleton } from './components/ui/Spinner';
import { initAuth } from './stores/auth';
import { initSettingsEffects } from './stores/settings';
import { useShortcuts } from './lib/shortcuts';
import { t } from './lib/i18n';
import ViewerPage from './routes/ViewerPage';
import NotFoundPage from './routes/NotFoundPage';

const ComparePage = lazy(() => import('./routes/ComparePage'));
const SharedPage = lazy(() => import('./routes/SharedPage'));
const HistoryPage = lazy(() => import('./routes/HistoryPage'));
const AccountPage = lazy(() => import('./routes/AccountPage'));
const LoginPage = lazy(() => import('./routes/LoginPage'));

initSettingsEffects();

function Shell(props: RouteSectionProps) {
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  useShortcuts([{ key: '?', handler: () => setShortcutsOpen((o) => !o) }]);
  onMount(() => void initAuth());
  return (
    <div class="flex h-full flex-col">
      <Header onShortcuts={() => setShortcutsOpen(true)} />
      <JobBar />
      <main class="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div class="space-y-3 p-6">
              <Skeleton class="h-6 w-1/3" />
              <Skeleton class="h-64 w-full" />
            </div>
          }
        >
          <ErrorBoundary
            fallback={(err, reset) => (
              <div class="mx-auto max-w-md p-10 text-center" role="alert">
                <p class="text-danger">{err instanceof Error ? err.message : String(err)}</p>
                <button class="mt-3 rounded-md border border-border px-3 py-1.5" onClick={reset}>
                  {t('common.retry')}
                </button>
              </div>
            )}
          >
            {props.children}
          </ErrorBoundary>
        </Suspense>
      </main>
      <Footer />
      <ToastHost />
      <ConfirmHost />
      <KeyboardShortcutsDialog open={shortcutsOpen()} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

export default function App() {
  return (
    <Router root={Shell}>
      <Route path="/" component={ViewerPage} />
      <Route path="/compare" component={ComparePage} />
      <Route path="/s/:slug" component={SharedPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="*" component={NotFoundPage} />
    </Router>
  );
}
