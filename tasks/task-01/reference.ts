export function groupBy<T, K extends PropertyKey>(
  items: readonly T[],
  keyOf: (item: T) => K,
): Record<K, T[]> {
  const groups = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyOf(item);
    const group = groups[key] ?? [];
    group.push(item);
    groups[key] = group;
  }
  return groups;
}
