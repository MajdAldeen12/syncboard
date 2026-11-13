import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Motion and GSAP must never animate the same element. The boundary is
// enforced by location: GSAP belongs to the landing page, Motion to the app.
const LANDING_FILES = ["src/app/(marketing)/**", "src/features/landing/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "syncboard/landing-uses-gsap-only",
    files: LANDING_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["motion", "motion/*", "framer-motion", "framer-motion/*"],
              message:
                "The landing page animates with GSAP only. Motion is for the app.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "syncboard/app-uses-motion-only",
    files: ["src/**"],
    ignores: LANDING_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["gsap", "gsap/*", "@gsap/*"],
              message:
                "GSAP is for the landing page only. Use Motion inside the app.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
