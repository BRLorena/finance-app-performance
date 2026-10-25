import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules",
      "results",
      "site",
      "previous-site",
      "test-results",
      "playwright-report",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // k6 scripts run in k6's runtime, not Node
    files: ["load/**/*.ts"],
    languageOptions: { globals: { __ENV: "readonly", __VU: "readonly" } },
  },
);
