import '../../test/fakeWorkers';
import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { DocContext, createDocument } from '../../stores/document';
import { TreeView } from './TreeView';
import { PropertyPanel } from './PropertyPanel';
import { PathBar } from './PathBar';

const DOC = '{"users":[{"id":1,"name":"Ann"},{"id":2,"name":"Bob"}],"count":2,"dup":1,"dup":2}';

async function setup() {
  const store = createDocument({ initialText: DOC, persist: false });
  await store.parseNow();
  render(() => (
    <DocContext.Provider value={store}>
      <PathBar />
      <div style={{ height: '600px' }}>
        <TreeView />
      </div>
      <div style={{ height: '300px' }}>
        <PropertyPanel />
      </div>
    </DocContext.Provider>
  ));
  await waitFor(() => expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0));
  return store;
}

describe('TreeView', () => {
  it('shows the root expanded with ARIA tree attributes', async () => {
    await setup();
    const root = screen.getAllByRole('treeitem')[0]!;
    expect(root).toHaveAttribute('aria-level', '1');
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('treeitem')).toHaveLength(5); // root + users, count, dup, dup
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });
  it('marks duplicate keys with a warning badge', async () => {
    await setup();
    expect(screen.getAllByRole('img', { name: 'Duplicate key' })).toHaveLength(2);
  });
  it('expands and collapses with the keyboard (Right / Left) and moves with Up / Down', async () => {
    const store = await setup();
    const tree = screen.getByRole('tree');
    const items = () => screen.getAllByRole('treeitem');
    fireEvent.click(items()[1]!); // users
    expect(store.doc.selectedNodeId).toBe(1);
    fireEvent.keyDown(tree, { key: 'ArrowRight' }); // expand users
    await waitFor(() => expect(items()).toHaveLength(7));
    expect(items()[1]).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(tree, { key: 'ArrowRight' }); // move into first child
    expect(store.doc.selectedNodeId).toBe(2);
    fireEvent.keyDown(tree, { key: 'ArrowLeft' }); // collapsed child? it is collapsed → go to parent
    expect(store.doc.selectedNodeId).toBe(1);
    fireEvent.keyDown(tree, { key: 'ArrowLeft' }); // collapse users
    await waitFor(() => expect(items()).toHaveLength(5));
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(store.doc.selectedNodeId).toBe(8);
    fireEvent.keyDown(tree, { key: 'Home' });
    expect(store.doc.selectedNodeId).toBe(0);
    fireEvent.keyDown(tree, { key: 'End' });
    await waitFor(() => expect(store.doc.selectedNodeId).toBe(10));
  });
  it('`*` expands all sibling containers', async () => {
    const store = await setup();
    fireEvent.click(screen.getAllByRole('treeitem')[1]!);
    fireEvent.keyDown(screen.getByRole('tree'), { key: '*' });
    await waitFor(() => expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(5));
    expect(store.doc.selectedNodeId).toBe(1);
  });
  it('clicking the chevron toggles a node', async () => {
    await setup();
    const item = screen.getAllByRole('treeitem')[1]!;
    fireEvent.click(item.querySelector('button[aria-label="Expand"]')!);
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(7));
  });
});

describe('PropertyPanel + PathBar', () => {
  it('lists the children of the selected container as Name | Value | Type', async () => {
    await setup();
    fireEvent.click(screen.getAllByRole('treeitem')[0]!);
    const rowsOf = () => within(screen.getByTestId('property-rows')).getAllByRole('row');
    await waitFor(() => expect(rowsOf().length).toBe(4));
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Value/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Type/ })).toBeInTheDocument();
    const rows = rowsOf();
    expect(rows[0]).toHaveTextContent('users');
    expect(rows[0]).toHaveTextContent('[2]');
    expect(rows[0]).toHaveTextContent('array');
  });
  it('sorts by column and selecting a row selects that child', async () => {
    const store = await setup();
    fireEvent.click(screen.getAllByRole('treeitem')[0]!);
    const rowsOf = () => within(screen.getByTestId('property-rows')).getAllByRole('row');
    await waitFor(() => expect(rowsOf().length).toBe(4));
    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Type' })); // descending
    await waitFor(() => expect(rowsOf()[0]).toHaveTextContent('number'));
    fireEvent.click(rowsOf().find((r) => r.textContent?.startsWith('count'))!);
    expect(store.doc.selectedNodeId).toBe(8);
  });
  it('path bar navigates on Enter and reports unknown paths', async () => {
    const store = await setup();
    const input = screen.getByRole('textbox', { name: 'JSON path' });
    fireEvent.input(input, { target: { value: '$.users[1].name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.doc.selectedNodeId).toBe(7);
    expect(input).toHaveValue('$.users[1].name');
    fireEvent.input(input, { target: { value: '$.nope' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
