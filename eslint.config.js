import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "convex/_generated/**",
      "app/routeTree.gen.ts",
      ".output/**",
      ".vercel/**",
      "dist/**",
      "build/**",
      "output/**",
      "node_modules/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript's own type-checking already covers undefined identifiers;
      // the base rule produces false positives on Node/Convex globals.
      "no-undef": "off",
      // Pre-existing codebase relies heavily on `any` for Shopify/GraphQL
      // payloads; keep flagging it, but don't fail CI on existing usage.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn"
    }
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "warn"
    }
  }
);
