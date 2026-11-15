import { settings } from '../../stores/settings';
import { en } from './en';
import type { Dict } from './en';
import { uk } from './uk';
import { ApiError } from '../api/client';

export type Key = keyof Dict;
const dicts: Record<'en' | 'uk', Dict> = { en, uk };

export function translate(lang: 'en' | 'uk', key: Key, params?: Record<string, string | number>): string {
  let s: string = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Reactive translate: reads the current language signal. */
export function t(key: Key, params?: Record<string, string | number>): string {
  return translate(settings.language, key, params);
}

export const locale = () => (settings.language === 'uk' ? 'uk-UA' : 'en-US');

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    typeof d === 'string' ? new Date(d) : d,
  );
}

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function fmtRelative(d: string | Date, now = Date.now()): string {
  const diff = Math.round(((typeof d === 'string' ? new Date(d) : d).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  for (const [unit, sec] of UNITS)
    if (Math.abs(diff) >= sec || unit === 'second') return rtf.format(Math.round(diff / sec), unit);
  return '';
}

export function fmtSize(bytes: number): string {
  const nf = (v: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(v);
  if (bytes < 1024) return `${nf(bytes)} ${t('unit.b')}`;
  if (bytes < 1024 * 1024) return `${nf(bytes / 1024)} ${t('unit.kb')}`;
  return `${nf(bytes / 1024 / 1024)} ${t('unit.mb')}`;
}

/** Map an unknown error to a translated, user-facing message. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `error.${e.code}` as Key;
    let msg = key in en ? t(key) : e.message;
    if (e.status === 429 && e.retryAfter) msg += ' ' + t('error.retry_after', { seconds: e.retryAfter });
    return msg;
  }
  return e instanceof Error ? e.message : String(e);
}

export function useI18n() {
  return { t, locale, fmtDate, fmtNumber, fmtRelative, fmtSize };
}
