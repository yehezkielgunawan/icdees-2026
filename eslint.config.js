import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "campaigns/**",
      "generated/**",
      ".work/**",
      "node_modules/**",
      "dist/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "complexity": ["error", { max: 12 }],
      "no-constant-condition": "error",
      "no-else-return": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "prefer-const": "error",
      eqeqeq: "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" },
      ],
    },
  },
);
