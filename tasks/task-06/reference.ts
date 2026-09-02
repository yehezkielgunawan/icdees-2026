export function validateConfig(
  input: Record<string, unknown>,
  requiredKeys: readonly string[],
): { valid: boolean; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of requiredKeys) {
    const value = input[key];
    if (!(key in input) || value === null || value === undefined) {
      missing.push(key);
    } else if (typeof value === "string" && value.trim() === "") {
      invalid.push(key);
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}
