export function dedupeById<T extends { id: string | number }>(
  items: readonly T[],
): T[] {
  const seen = new Set<string | number>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
