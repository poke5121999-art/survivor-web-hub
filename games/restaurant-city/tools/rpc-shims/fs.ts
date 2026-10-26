// Replaces node:fs for the bundled server sources. The original reads the
// client data files under server/public/data at runtime; on the edge they are
// embedded at build time (rc-data:files, a { basename: text } map).
// Any other path behaves like a missing file (ENOENT), as it would on a server
// without that file.
import files from 'rc-data:files';

const DATA_FILE = /(?:^|\/)public\/data\/([^/]+)$/;
const DATA_DIR = /(?:^|\/)public\/data$/;

function norm(p: unknown): string {
  return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function enoent(p: unknown): Error {
  const error = new Error(`ENOENT: no such file or directory, open '${String(p)}'`) as Error & { code: string };
  error.code = 'ENOENT';
  return error;
}

function lookup(p: unknown): string | undefined {
  const match = DATA_FILE.exec(norm(p));
  return match ? (files as Record<string, string>)[match[1]] : undefined;
}

export function readFileSync(p: unknown, options?: unknown): string | Uint8Array {
  const text = lookup(p);
  if (text === undefined) throw enoent(p);
  const encoding = typeof options === 'string' ? options : (options as { encoding?: string } | undefined)?.encoding;
  return encoding ? text : new TextEncoder().encode(text);
}

export function existsSync(p: unknown): boolean {
  return lookup(p) !== undefined || DATA_DIR.test(norm(p));
}

export function readdirSync(p: unknown): string[] {
  if (!DATA_DIR.test(norm(p))) throw enoent(p);
  return Object.keys(files).sort();
}

export function statSync(p: unknown) {
  const isDir = DATA_DIR.test(norm(p));
  const text = lookup(p);
  if (!isDir && text === undefined) throw enoent(p);
  return { isFile: () => !isDir, isDirectory: () => isDir, size: text?.length ?? 0 };
}

export default { readFileSync, existsSync, readdirSync, statSync };
