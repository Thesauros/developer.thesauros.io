import { paginate, parseLimit, MAX_LIMIT, DEFAULT_LIMIT } from './paged';

describe('paginate', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);

  it('returns the first page and an opaque cursor', () => {
    const page = paginate(rows, { limit: '10' });
    expect(page.data).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(page.meta.total).toBe(25);
    expect(page.meta.has_more).toBe(true);
    expect(typeof page.meta.next_cursor).toBe('string');
    // Opaque: the client must not be able to read an offset out of it.
    expect(page.meta.next_cursor).not.toContain('10');
  });

  it('walks the whole set without repeating or skipping rows', () => {
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = paginate(rows, { limit: '10', cursor });
      seen.push(...page.data);
      cursor = (page.meta.next_cursor as string | null) ?? undefined;
    } while (cursor);
    expect(seen).toEqual(rows);
  });

  it('closes the page set with a null cursor', () => {
    const page = paginate(rows, { limit: '25' });
    expect(page.meta.has_more).toBe(false);
    expect(page.meta.next_cursor).toBeNull();
  });

  it('restarts from the beginning on an unreadable cursor', () => {
    const page = paginate(rows, { limit: '5', cursor: 'not-a-cursor' });
    expect(page.data).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps the limit', () => {
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('9999')).toBe(MAX_LIMIT);
    expect(parseLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(parseLimit('abc')).toBe(DEFAULT_LIMIT);
  });
});
