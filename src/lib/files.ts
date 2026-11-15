export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatBytes(n: number, locale?: string): string {
  const f = (v: number, unit: string) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)} ${unit}`;
  if (n < 1024) return f(n, 'B');
  if (n < 1024 * 1024) return f(n / 1024, 'KB');
  return f(n / (1024 * 1024), 'MB');
}

export const MAX_DOCUMENT_BYTES = Number(import.meta.env.VITE_MAX_DOCUMENT_BYTES ?? 5242880);
export const MAX_FETCH_BYTES = Number(import.meta.env.VITE_MAX_FETCH_BYTES ?? 10485760);
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? '';
