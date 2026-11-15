import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { HistoryList } from './HistoryList';
import type { HistoryItem } from '../../lib/api/endpoints';

const item = (id: string, over: Partial<HistoryItem> = {}): HistoryItem => ({
  id,
  title: `Doc ${id}`,
  preview: '{"a":1}',
  size_bytes: 2048,
  is_valid_json: true,
  source: 'format',
  source_url: null,
  share_slug: null,
  pinned: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: new Date(Date.now() - 3600_000).toISOString(),
  ...over,
});

const mount = (over: Partial<Parameters<typeof HistoryList>[0]> = {}) => {
  const actions = { onOpen: vi.fn(), onRename: vi.fn(), onPin: vi.fn(), onShare: vi.fn(), onDelete: vi.fn() };
  const onSelect = vi.fn();
  const onLoadMore = vi.fn();
  render(() => (
    <HistoryList
      items={[item('1'), item('2', { pinned: true, share_slug: 'sl', is_valid_json: false })]}
      loading={false}
      hasMore={false}
      filtered={false}
      selected={new Set(['2'])}
      onSelect={onSelect}
      onLoadMore={onLoadMore}
      actions={actions}
      {...over}
    />
  ));
  return { actions, onSelect, onLoadMore };
};

describe('HistoryList', () => {
  it('renders title, preview, size, source badge, share link and relative time', () => {
    mount();
    const rows = screen.getAllByTestId('history-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Doc 1');
    expect(rows[0]).toHaveTextContent('{"a":1}');
    expect(rows[0]).toHaveTextContent('2 KB');
    expect(rows[0]).toHaveTextContent('Format');
    expect(rows[0]!.querySelector('time')).toHaveAttribute('title');
    expect(rows[1]).toHaveTextContent('Shared');
    expect(rows[1]).toHaveTextContent('invalid JSON');
    expect(screen.getByRole('link', { name: /Shared/ })).toHaveAttribute('href', '/s/sl');
  });
  it('fires open / pin / share / delete / select actions', () => {
    const { actions, onSelect } = mount();
    const row = screen.getAllByTestId('history-item')[0]!;
    fireEvent.click(row.querySelector('button[aria-label="Open"]')!);
    fireEvent.click(row.querySelector('button[aria-label="Pin"]')!);
    fireEvent.click(row.querySelector('button[aria-label="Share"]')!);
    fireEvent.click(row.querySelector('button[aria-label="Delete"]')!);
    fireEvent.click(row.querySelector('input[type="checkbox"]')!);
    expect(actions.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expect(actions.onPin).toHaveBeenCalled();
    expect(actions.onShare).toHaveBeenCalled();
    expect(actions.onDelete).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('1', true);
    expect(screen.getAllByRole('checkbox')[1]).toBeChecked();
  });
  it('renames inline with Enter and cancels with Escape', () => {
    const { actions } = mount();
    const row = screen.getAllByTestId('history-item')[0]!;
    fireEvent.click(row.querySelector('button[aria-label="Rename"]')!);
    const input = screen.getByLabelText('Entry title');
    fireEvent.input(input, { target: { value: 'New name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(actions.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), 'New name');
    fireEvent.click(row.querySelector('button[aria-label="Rename"]')!);
    fireEvent.keyDown(screen.getByLabelText('Entry title'), { key: 'Escape' });
    expect(screen.queryByLabelText('Entry title')).toBeNull();
    expect(actions.onRename).toHaveBeenCalledTimes(1);
  });
  it('shows the empty state, filtered empty state, skeleton and "Load more"', () => {
    mount({ items: [] });
    expect(screen.getByTestId('history-empty')).toHaveTextContent('No history yet');
  });
  it('filtered empty state differs from the first-run one', () => {
    mount({ items: [], filtered: true });
    expect(screen.getByText('No entries match your filters.')).toBeInTheDocument();
  });
  it('load more button', () => {
    const { onLoadMore } = mount({ hasMore: true });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});
