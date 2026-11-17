import type { components } from './schema';
import { request } from './client';

type S = components['schemas'];
export type User = S['UserOut'];
export type SessionInfo = S['SessionOut'];
export type FetchResponse = S['FetchResponse'];
export type CreateShareRequest = S['CreateShareRequest'];
export type ShareCreated = S['ShareCreated'];
export type ShareDetail = S['ShareDetail'];
export type SharePage = S['SharePage'];
export type HistoryItem = S['HistoryItem'];
export type HistoryDetail = S['HistoryDetail'];
export type HistoryPage = S['HistoryPage'];
export type HistorySource = S['CreateHistoryRequest']['source'];
export type ShareMeta = S['ShareMeta'];
export type ShareComment = S['CommentOut'];
export type DuplicatesRequest = S['DuplicatesRequest'];
export type DuplicatesResponse = S['DuplicatesResponse'];

export interface HistoryQuery {
  q?: string;
  source?: HistorySource | '';
  pinned?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'updated_at' | 'created_at' | 'title' | 'size';
  order?: 'asc' | 'desc';
}

export const api = {
  health: (signal?: AbortSignal) => request<S['HealthResponse']>('/health', { signal, timeoutMs: 5000 }),

  providers: () => request<S['ProvidersResponse']>('/auth/providers'),
  me: () => request<S['MeResponse']>('/auth/me', { quiet401: true }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  sessions: () => request<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) =>
    request<void>(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  revokeOtherSessions: () => request<void>('/auth/sessions', { method: 'DELETE' }),
  deleteAccount: () => request<void>('/auth/account', { method: 'DELETE' }),

  fetchUrl: (url: string, signal?: AbortSignal) =>
    request<FetchResponse>('/fetch', { method: 'POST', body: { url }, signal, timeoutMs: 45_000 }),

  createShare: (body: CreateShareRequest) => request<ShareCreated>('/shares', { method: 'POST', body }),
  getShare: (slug: string, signal?: AbortSignal) =>
    request<ShareDetail>(`/shares/${encodeURIComponent(slug)}`, { signal }),
  deleteShare: (slug: string, deleteToken?: string) =>
    request<void>(`/shares/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: deleteToken ? { 'X-Delete-Token': deleteToken } : undefined,
    }),
  shareMeta: (slug: string, signal?: AbortSignal) =>
    request<ShareMeta>(`/shares/${encodeURIComponent(slug)}/meta`, { signal }),
  /** Open a locked share (password / one-time link); one-time shares are destroyed by this call. */
  openShare: (slug: string, password?: string, signal?: AbortSignal) =>
    request<ShareDetail>(`/shares/${encodeURIComponent(slug)}/open`, {
      method: 'POST',
      body: { password },
      signal,
    }),
  listComments: (slug: string, password?: string) =>
    request<ShareComment[]>(`/shares/${encodeURIComponent(slug)}/comments`, {
      headers: password ? { 'X-Share-Password': password } : undefined,
    }),
  addComment: (slug: string, body: { text: string; author: string; path?: string }, password?: string) =>
    request<ShareComment>(`/shares/${encodeURIComponent(slug)}/comments`, {
      method: 'POST',
      body,
      headers: password ? { 'X-Share-Password': password } : undefined,
    }),
  deleteComment: (slug: string, id: string, deleteToken?: string) =>
    request<void>(`/shares/${encodeURIComponent(slug)}/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: deleteToken ? { 'X-Delete-Token': deleteToken } : undefined,
    }),
  listShares: (limit = 20, offset = 0) => request<SharePage>('/shares', { query: { limit, offset } }),

  listHistory: (q: HistoryQuery = {}, signal?: AbortSignal) =>
    request<HistoryPage>('/history', { query: { ...q, pinned: q.pinned ? true : undefined }, signal }),
  saveHistory: (body: S['CreateHistoryRequest']) =>
    request<HistoryDetail>('/history', { method: 'POST', body }),
  getHistory: (id: string) => request<HistoryDetail>(`/history/${encodeURIComponent(id)}`),
  updateHistory: (id: string, patch: { title?: string; pinned?: boolean }) =>
    request<HistoryDetail>(`/history/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  deleteHistory: (id: string) => request<void>(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearHistory: () => request<void>('/history', { method: 'DELETE', body: { confirm: true } }),

  analyzeDuplicates: (body: DuplicatesRequest, signal?: AbortSignal) =>
    request<DuplicatesResponse>('/analysis/duplicates', { method: 'POST', body, signal, timeoutMs: 60_000 }),
};

/** Full-page navigation URL for starting an OAuth login. */
export function loginUrl(provider: string, returnTo: string): string {
  return `/api/auth/${encodeURIComponent(provider)}/login?return_to=${encodeURIComponent(returnTo)}`;
}
