import { createTwoFilesPatch } from 'diff';

export function makePatch(
  left: string,
  right: string,
  opts: { context?: number; ignoreWhitespace?: boolean } = {},
): string {
  return createTwoFilesPatch('left.json', 'right.json', left, right, '', '', {
    context: opts.context ?? 3,
    ignoreWhitespace: opts.ignoreWhitespace,
  });
}
