import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      // Build output
      "dist/**",
      "build/**",
      // Node modules
      "node_modules/**",
      // Coverage directory
      "coverage/**",
      // Logs
      "logs/**",
      "*.log",
      // Environment variables
      ".env",
      ".env.*",
      // Bun lockfile
      "bun.lock",
      // Misc
      ".DS_Store",
      ".idea/**",
      ".vscode/**",
      "*.swp",
      "*.swo",
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      prettier: prettierPlugin,
    },
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // General code style rules
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "warn",
      // Prettier integration
      "prettier/prettier": ["error", {}, { usePrettierrc: true }],
    },
  },
  eslintConfigPrettier,
];
