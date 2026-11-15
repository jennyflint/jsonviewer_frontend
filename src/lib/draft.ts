/**
 * Draft persistence. localStorage cannot hold more than a few MB, so drafts live in IndexedDB
 * (up to MAX_DRAFT_CHARS); without IndexedDB we fall back to localStorage (small drafts only).
 */
import { getItem, removeItem, setItem } from './storage';

export const MAX_DRAFT_CHARS = 15 * 1024 * 1024;
const LS_KEY = 'jv.draft.v1';
const DB = 'jsonviewer';
const STORE = 'drafts';
const KEY = 'main';

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
export async function saveDraft(text: string): Promise<boolean> {
  if (text.length > MAX_DRAFT_CHARS) return false;
  if (hasIndexedDb()) {
    await idb('readwrite', (s) => s.put(text, KEY));
    removeItem(LS_KEY); // migrate away from the legacy copy
    return true;
  }
  return setItem(LS_KEY, text);
}

export async function loadDraft(): Promise<string | null> {
  if (hasIndexedDb()) {
    const v = await idb<string>('readonly', (s) => s.get(KEY) as IDBRequest<string>);
    if (typeof v === 'string') return v;
  }
  return getItem(LS_KEY);
}

export async function removeDraft(): Promise<void> {
  removeItem(LS_KEY);
  if (hasIndexedDb()) await idb('readwrite', (s) => s.delete(KEY));
}
