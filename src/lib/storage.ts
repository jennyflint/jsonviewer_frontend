/** Safe localStorage wrapper: every access is guarded (private mode, blocked storage, quota). */
export const MAX_STORED_BYTES = 2 * 1024 * 1024;

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getItem(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be stored (blocked, over the size cap, quota). */
export function setItem(key: string, value: string, maxBytes = MAX_STORED_BYTES): boolean {
  if (value.length * 2 > maxBytes) return false;
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getJSON<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON(key: string, value: unknown, maxBytes?: number): boolean {
  try {
    return setItem(key, JSON.stringify(value), maxBytes);
  } catch {
    return false;
  }
}
