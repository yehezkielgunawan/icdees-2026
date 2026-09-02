function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateRegistrationForm(input: {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const username = input.username;
  const password = input.password;

  if (
    typeof username !== "string" ||
    !/^[A-Za-z0-9_]{3,20}$/.test(username)
  ) {
    errors.username = "Username must be 3-20 alphanumeric characters or underscores";
  }
  if (!isValidEmail(input.email)) {
    errors.email = "Email is invalid";
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    errors.password = "Password must be at least 8 characters with a letter and number";
  }
  if (typeof input.confirmPassword !== "string" || input.confirmPassword !== password) {
    errors.confirmPassword = "Passwords do not match";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
