import { describe, expect, it } from "vitest";
import { validateRegistrationForm } from "./candidate.js";

describe("validateRegistrationForm", () => {
  it("accepts a valid registration", () => {
    expect(
      validateRegistrationForm({
        username: "alice_01",
        email: "alice@example.com",
        password: "secure123",
        confirmPassword: "secure123",
      }),
    ).toEqual({ valid: true, errors: {} });
  });

  it("rejects missing fields", () => {
    const result = validateRegistrationForm({});

    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual([
      "confirmPassword",
      "email",
      "password",
      "username",
    ]);
  });

  it("rejects malformed username and email", () => {
    const result = validateRegistrationForm({
      username: "a b",
      email: "not-an-email",
      password: "secure123",
      confirmPassword: "secure123",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty("username");
    expect(result.errors).toHaveProperty("email");
  });

  it("rejects weak and mismatched passwords", () => {
    const result = validateRegistrationForm({
      username: "alice",
      email: "alice@example.com",
      password: "password",
      confirmPassword: "different1",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty("password");
    expect(result.errors).toHaveProperty("confirmPassword");
  });

  it("rejects a username outside the length bounds", () => {
    const result = validateRegistrationForm({
      username: "ab",
      email: "alice@example.com",
      password: "secure123",
      confirmPassword: "secure123",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty("username");
  });
});
