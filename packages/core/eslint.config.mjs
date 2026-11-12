import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // This package runs in the browser, in Node and in Cloudflare Workers.
    name: "syncboard/core-stays-pure",
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "node:*",
                "cloudflare:*",
                "partyserver",
                "y-partyserver",
                "y-partyserver/*",
              ],
              message:
                "packages/core is pure TypeScript: no React, Next, Node or Workers imports.",
            },
          ],
        },
      ],
    },
  },
]);
