// Checks that the ESLint rule keeping Motion and GSAP apart still does its
// job: it must reject GSAP in the app and Motion on the landing page, and
// allow each where it belongs. Run by `pnpm lint`, so a change to the ESLint
// config that weakens the rule fails here.
//
// The rule sees only direct imports. That GSAP never runs on the board at
// all, however it might get there, is checked by `e2e/landing.spec.ts`.
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const eslint = new ESLint({
  cwd: fileURLToPath(new URL("..", import.meta.url)),
});

const GSAP = 'import gsap from "gsap";';
const MOTION = 'import { motion } from "motion/react";';

const cases = [
  { file: "src/features/board/probe.tsx", code: GSAP, allowed: false },
  { file: "src/features/presence/probe.tsx", code: GSAP, allowed: false },
  { file: "src/app/(app)/demo/probe.tsx", code: GSAP, allowed: false },
  {
    file: "src/lib/probe.ts",
    code: 'import { useGSAP } from "@gsap/react";',
    allowed: false,
  },
  {
    file: "src/features/board/probe.tsx",
    code: 'import { ScrollTrigger } from "gsap/ScrollTrigger";',
    allowed: false,
  },
  { file: "src/app/(marketing)/probe.tsx", code: MOTION, allowed: false },
  {
    file: "src/features/landing/probe.tsx",
    code: 'import { animate } from "motion";',
    allowed: false,
  },
  {
    file: "src/features/landing/probe.tsx",
    code: 'import { motion } from "framer-motion";',
    allowed: false,
  },
  { file: "src/features/landing/probe.tsx", code: GSAP, allowed: true },
  { file: "src/app/(marketing)/probe.tsx", code: GSAP, allowed: true },
  { file: "src/features/board/probe.tsx", code: MOTION, allowed: true },
];

let failed = 0;
for (const { file, code, allowed } of cases) {
  const [result] = await eslint.lintText(`${code}\nexport { };\n`, {
    filePath: file,
  });
  const rejected = result.messages.some(
    (message) => message.ruleId === "no-restricted-imports",
  );
  if (rejected === allowed) {
    failed += 1;
    console.error(
      `${file}: ${code} should be ${allowed ? "allowed" : "rejected"}, but was ${rejected ? "rejected" : "allowed"}.`,
    );
  }
}

if (failed > 0) {
  console.error(
    `The Motion and GSAP boundary is broken: ${failed} of ${cases.length} checks failed.`,
  );
  process.exit(1);
}
console.log(`The Motion and GSAP boundary holds (${cases.length} checks).`);
