import type { JSX } from 'solid-js';

/** Wrap occurrences of `query` in <mark>. Regex queries highlight the whole text. All content stays text nodes. */
export function highlightText(
  text: string,
  query: string,
  opts: { caseSensitive: boolean; regex: boolean },
  active: boolean,
): JSX.Element {
  if (!query) return text;
  const cls = active ? 'hit active' : 'hit';
  if (opts.regex) return <mark class={cls}>{text}</mark>;
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const parts: JSX.Element[] = [];
  let i = 0;
  let found = hay.indexOf(needle);
  if (found === -1) return text;
  while (found !== -1) {
    if (found > i) parts.push(text.slice(i, found));
    parts.push(<mark class={cls}>{text.slice(found, found + needle.length)}</mark>);
    i = found + needle.length;
    found = hay.indexOf(needle, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}
