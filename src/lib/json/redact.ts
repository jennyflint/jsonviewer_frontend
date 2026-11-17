import { decodeToken, keyOf, raw } from './access';
import { T_STRING } from './parser';
import type { JsonModel } from './parser';

export interface RedactOptions {
  /** Key patterns: case-insensitive; plain words match inside the key (`password` ⊂ `userPassword`), `*` is a glob. */
  keys: string[];
  /** Regular expressions applied to string values (e.g. e-mail addresses). */
  valuePatterns: string[];
  replacement: string;
}

export const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'session_id',
  'private_key',
  'access_key',
  'credit_card',
  'card_number',
  'cvv',
  'ssn',
];

export const DEFAULT_REDACT: RedactOptions = {
  keys: DEFAULT_SENSITIVE_KEYS,
  valuePatterns: [],
  replacement: '***',
};

export interface RedactResult {
  text: string;
  keyMatches: number;
  valueMatches: number;
  error?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9*]/g, '');

function keyMatcher(patterns: string[]): (key: string) => boolean {
  const plain: string[] = [];
  const globs: RegExp[] = [];
  for (const p of patterns.map(norm).filter(Boolean)) {
    if (p.includes('*'))
      globs.push(
        new RegExp(
          '^' +
            p
              .split('*')
              .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*') +
            '$',
        ),
      );
    else plain.push(p);
  }
  return (key) => {
    const k = norm(key);
    return plain.some((p) => k.includes(p)) || globs.some((g) => g.test(k));
  };
}

/** Replace the values of sensitive keys (and regex matches inside strings), keeping all other formatting intact. */
export function redactModel(m: JsonModel, o: RedactOptions): RedactResult {
  let regexes: RegExp[];
  try {
    regexes = o.valuePatterns.filter((p) => p.trim()).map((p) => new RegExp(p, 'g'));
  } catch (e) {
    return {
      text: m.text,
      keyMatches: 0,
      valueMatches: 0,
      error: e instanceof Error ? e.message : 'Invalid regular expression',
    };
  }
  const isSensitive = keyMatcher(o.keys);
  const literal = JSON.stringify(o.replacement);
  const edits: { from: number; to: number; text: string }[] = [];
  let keyMatches = 0;
  let valueMatches = 0;
  let id = 0;
  while (id < m.count) {
    if ((m.keyStart[id] as number) >= 0 && isSensitive(keyOf(m, id) as string)) {
      edits.push({ from: m.start[id] as number, to: m.end[id] as number, text: literal });
      keyMatches++;
      id = m.subtreeEnd[id] as number; // the whole value is replaced
      continue;
    }
    if (regexes.length && (m.type[id] as number) === T_STRING) {
      const value = decodeToken(raw(m, id));
      let next = value;
      for (const re of regexes) next = next.replace(re, o.replacement);
      if (next !== value) {
        edits.push({ from: m.start[id] as number, to: m.end[id] as number, text: JSON.stringify(next) });
        valueMatches++;
      }
    }
    id++;
  }
  let out = '';
  let pos = 0;
  for (const e of edits) {
    out += m.text.slice(pos, e.from) + e.text;
    pos = e.to;
  }
  return { text: out + m.text.slice(pos), keyMatches, valueMatches };
}
