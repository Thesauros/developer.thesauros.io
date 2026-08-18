/**
 * Cursor pagination for list endpoints.
 *
 * The contract asks for `?limit=&cursor=` with an opaque `meta.next_cursor`.
 * The cursor encodes an offset into the (deterministically ordered) result
 * set; opaque so the shape can change without breaking clients.
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * Marker returned by controllers that paginate. The response envelope
 * interceptor unwraps it into `{object:"list", data, meta}` — returning a
 * bare array stays valid for lists that are not paginated.
 */
export class Paged<T> {
  constructor(
    readonly data: T[],
    readonly meta: Record<string, unknown>,
  ) {}
}

function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^o:(\d+)$/.exec(decoded);
  // An unreadable cursor restarts from the beginning rather than 500ing: it is
  // always a client-side artefact (truncated URL, stale bookmark).
  return match ? parseInt(match[1], 10) : 0;
}

export function parseLimit(raw: string | undefined, fallback = DEFAULT_LIMIT): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

export function paginate<T>(
  rows: T[],
  options: { limit?: string; cursor?: string; meta?: Record<string, unknown> } = {},
): Paged<T> {
  const limit = parseLimit(options.limit);
  const offset = decodeCursor(options.cursor);
  const page = rows.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return new Paged(page, {
    ...(options.meta ?? {}),
    total: rows.length,
    limit,
    has_more: nextOffset < rows.length,
    next_cursor: nextOffset < rows.length ? encodeCursor(nextOffset) : null,
  });
}
