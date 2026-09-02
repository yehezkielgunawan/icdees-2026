export function parseQuery(query: string): Record<string, string | string[]> {
  const result = Object.create(null) as Record<string, string | string[]>;
  const parameters = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);

  for (const [key, value] of parameters) {
    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}
