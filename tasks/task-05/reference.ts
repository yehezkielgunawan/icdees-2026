function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function validatePaginationQuery(input: {
  page?: unknown;
  pageSize?: unknown;
}): {
  valid: boolean;
  page: number | null;
  pageSize: number | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const page = input.page === undefined ? 1 : parsePositiveInteger(input.page);
  const pageSize =
    input.pageSize === undefined ? 20 : parsePositiveInteger(input.pageSize);

  if (page === null) {
    errors.page = "Page must be a positive integer";
  }
  if (pageSize === null || pageSize > 100) {
    errors.pageSize = "Page size must be a positive integer no greater than 100";
  }

  return { valid: Object.keys(errors).length === 0, page, pageSize, errors };
}
