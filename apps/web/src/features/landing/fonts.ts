import { Schibsted_Grotesk } from "next/font/google";

/**
 * The landing page's headline face. Loaded here rather than in the root
 * layout so that only the landing page asks for it; the app keeps Geist.
 * Used through Tailwind's `font-display`, which falls back to Geist.
 */
export const displayFont = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
});
