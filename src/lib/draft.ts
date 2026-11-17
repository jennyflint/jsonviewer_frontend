/**
 * Draft persistence. localStorage cannot hold more than a few MB, so drafts live in IndexedDB
 * (up to MAX_DRAFT_CHARS); without IndexedDB we fall back to localStorage (small drafts only).
 */
import { getItem, removeItem, setItem } from './storage';

export const MAX_DRAFT_CHARS = 15 * 1024 * 1024;
const LS_KEY = 'jv.draft.v1';
const lsKey = (id: string) => (id === 'main' ? LS_KEY : `${LS_KEY}.${id}`);
const DB = 'jsonviewer';
const STORE = 'drafts';

function open(): Promise<IDBDatabase> | null {
  try {
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idb<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const p = open();
  if (!p) return undefined;
  try {
    const db = await p;
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return undefined;
  }
}

export const hasIndexedDb = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
};

/** Returns false when the draft could not be stored. */
export async function saveDraft(text: string, id = 'main'): Promise<boolean> {
  if (text.length > MAX_DRAFT_CHARS) return false;
  if (hasIndexedDb()) {
    await idb('readwrite', (s) => s.put(text, id));
    removeItem(lsKey(id)); // migrate away from the legacy copy
    return true;
  }
  return setItem(lsKey(id), text);
}

export async function loadDraft(id = 'main'): Promise<string | null> {
  if (hasIndexedDb()) {
    const v = await idb<string>('readonly', (s) => s.get(id) as IDBRequest<string>);
    if (typeof v === 'string') return v;
  }
  return getItem(lsKey(id));
}

export async function removeDraft(id = 'main'): Promise<void> {
  removeItem(lsKey(id));
  if (hasIndexedDb()) await idb('readwrite', (s) => s.delete(id));
}

// ---- small key/value helpers (snapshots, tab data) in the same IndexedDB store; memory fallback without IDB
const memory = new Map<string, unknown>();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!hasIndexedDb()) return memory.get(key) as T | undefined;
  return idb<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!hasIndexedDb()) {
    memory.set(key, value);
    return;
  }
  await idb('readwrite', (s) => s.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  memory.delete(key);
  if (hasIndexedDb()) await idb('readwrite', (s) => s.delete(key));
}
