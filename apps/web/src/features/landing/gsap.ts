import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// GSAP belongs to the landing page only (an ESLint rule keeps it out of the
// app, where Motion animates). Everything on this page that animates takes
// GSAP from here, so the plugins are registered once.
gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * The media queries every landing animation is set up under. Nothing is
 * animated unless `motion` matches: with `prefers-reduced-motion: reduce`
 * the page stays exactly as it was sent.
 */
export const MEDIA = {
  motion: "(prefers-reduced-motion: no-preference)",
  /** Wide enough for the tour's picture to sit beside its text. */
  wide: "(min-width: 768px)",
} as const;

export { gsap, ScrollTrigger, useGSAP };
