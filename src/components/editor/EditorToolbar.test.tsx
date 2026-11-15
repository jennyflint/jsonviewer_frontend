import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { EditorToolbar } from './EditorToolbar';
import type { ToolbarAction } from './EditorToolbar';

const mk = (over: Partial<ToolbarAction>[] = []): ToolbarAction[] => {
  const base: ToolbarAction[] = [
    { id: 'paste', label: 'Paste', icon: <i />, onClick: vi.fn(), primary: true },
    { id: 'format', label: 'Format', icon: <i />, onClick: vi.fn(), primary: true },
    { id: 'sort', label: 'Sort keys', icon: <i />, onClick: vi.fn() },
    { id: 'history', label: 'Save to history', icon: <i />, onClick: vi.fn(), hidden: true },
  ];
  return base.map((a, i) => ({ ...a, ...(over[i] ?? {}) }));
};

describe('EditorToolbar', () => {
  it('renders visible actions and fires handlers', () => {
    const actions = mk();
    render(() => <EditorToolbar actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(actions[1]!.onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Save to history' })).toBeNull();
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });
  it('respects disabled and active state', () => {
    render(() => <EditorToolbar actions={mk([{}, { disabled: true }, { active: true }])} />);
    expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sort keys' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('moves secondary actions into a "More" menu on mobile', () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      render(() => <EditorToolbar actions={mk()} />);
      expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sort keys' })).toBeNull();
      expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    } finally {
      window.matchMedia = orig;
    }
  });
});
