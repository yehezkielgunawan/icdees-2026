export function paginateByCursor<T>(
  items: readonly T[],
  cursor: string | null,
  limit: number,
  getId: (item: T) => string,
): { items: T[]; nextCursor: string | null } {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  let start = 0;
  if (cursor !== null) {
    const cursorIndex = items.findIndex((item) => getId(item) === cursor);
    if (cursorIndex < 0) {
      throw new Error("Unknown cursor");
    }
    start = cursorIndex + 1;
  }

  const page = items.slice(start, start + limit);
  const hasMore = start + page.length < items.length;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: hasMore && last !== undefined ? getId(last) : null,
  };
}
