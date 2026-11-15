import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, readText } from './clipboard';
import { downloadText, readFileText, MAX_DOCUMENT_BYTES } from './files';
import { registerShortcut, matches, modLabel } from './shortcuts';
import {
  nodeAtOffset,
  ancestors,
  childByKey,
  childByIndex,
  nodePosition,
  typeName,
  isPrimitive,
  rawKey,
  previewValue,
} from './json/access';
import { parseJson } from './json/parser';

afterEach(() => vi.unstubAllGlobals());

describe('clipboard', () => {
  it('copies via the async API and falls back to execCommand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('x')).toBe(true);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText('y')).toBe(true);
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('z')).toBe(false);
  });
  it('reads text or returns null when denied', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('abc') } });
    expect(await readText()).toBe('abc');
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) } });
    expect(await readText()).toBeNull();
  });
});

describe('files', () => {
  it('downloads text through an anchor', () => {
    const create = vi.fn().mockReturnValue('blob:x');
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadText('a.json', '{}');
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });
  it('reads files and exposes size limits', async () => {
    expect(await readFileText({ text: async () => '{"a":1}' } as unknown as File)).toBe('{"a":1}');
    expect(MAX_DOCUMENT_BYTES).toBe(15728640);
  });
});

describe('shortcut registry', () => {
  it('dispatches registered shortcuts, honours `when` and unregisters', () => {
    const fired = vi.fn();
    const off = registerShortcut({ key: 'k', mod: true, handler: fired });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(fired).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(fired).toHaveBeenCalledTimes(1);
    const guarded = vi.fn();
    const off2 = registerShortcut({ key: 'g', mod: true, when: () => false, handler: guarded });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    expect(guarded).not.toHaveBeenCalled();
    off2();
  });
  it('ignores plain keys typed into inputs', () => {
    const fired = vi.fn();
    const off = registerShortcut({ key: '?', handler: fired });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }));
    expect(fired).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }));
    expect(fired).toHaveBeenCalled();
    off();
    input.remove();
    expect(matches(new KeyboardEvent('keydown', { key: 'a' }), { key: 'a' })).toBe(true);
    expect(['Ctrl', '⌘']).toContain(modLabel());
  });
});

describe('model access helpers', () => {
  const r = parseJson('{\n  "a": [10, {"b": "txt"}],\n  "c": null\n}');
  if (!r.ok) throw new Error();
  const m = r.model;
  it('finds the deepest node at an offset', () => {
    const off = m.text.indexOf('"txt"');
    const id = nodeAtOffset(m, off + 1);
    expect(typeName(m, id)).toBe('string');
    expect(nodeAtOffset(m, m.text.indexOf('10'))).toBe(2);
    expect(nodeAtOffset(m, 0)).toBe(0);
    expect(nodeAtOffset(m, m.text.indexOf('"c"') + 1)).toBe(5);
  });
  it('navigates children and ancestors', () => {
    expect(childByKey(m, 0, 'c')).toBe(5);
    expect(childByKey(m, 0, 'zz')).toBe(-1);
    expect(childByIndex(m, 1, 1)).toBe(3);
    expect(childByIndex(m, 1, 5)).toBe(-1);
    expect(ancestors(m, 4)).toEqual([0, 1, 3, 4]);
    expect(nodePosition(m, 5, true)).toMatchObject({ line: 3, column: 3 });
    expect(isPrimitive(m, 5)).toBe(true);
    expect(rawKey(m, 5)).toBe('"c"');
    expect(previewValue(m, 1)).toBe('[2]');
    expect(previewValue(m, 0)).toBe('{2}');
    expect(previewValue(m, 4)).toBe('"txt"');
  });
  it('truncates long string previews', () => {
    const lr = parseJson(JSON.stringify('x'.repeat(500)));
    if (!lr.ok) throw new Error();
    expect(previewValue(lr.model, 0, 20).length).toBeLessThan(30);
    expect(previewValue(lr.model, 0, 20).endsWith('…"')).toBe(true);
  });
});

describe('memberKeysInRange', () => {
  it('returns only the keys that start inside the range, in order', async () => {
    const { memberKeysInRange } = await import('./json/access');
    const r = parseJson('{"a":1,"b":[true],"c":{"d":null}}');
    if (!r.ok) throw new Error();
    const all = memberKeysInRange(r.model, 0, r.model.text.length);
    expect(all.map((k) => r.model.text.slice(k.from, k.to))).toEqual(['"a"', '"b"', '"c"', '"d"']);
    const from = r.model.text.indexOf('"c"');
    expect(memberKeysInRange(r.model, from, r.model.text.length).map((k) => k.id)).toHaveLength(2);
    expect(memberKeysInRange(r.model, 0, r.model.text.length, 2)).toHaveLength(2);
    expect(memberKeysInRange(r.model, 1000, 2000)).toEqual([]);
  });
});
