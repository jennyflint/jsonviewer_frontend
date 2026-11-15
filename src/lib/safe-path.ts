/** Only relative, same-origin paths may be used as `return_to`. */
export function safeReturnTo(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  return path;
}
