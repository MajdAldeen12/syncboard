import type { PresenceUser } from "./types";

/**
 * Colours people are shown in. Each carries white text at WCAG AA contrast
 * (4.5:1 or better), which a test checks.
 */
export const PRESENCE_COLORS: readonly string[] = [
  "#2563eb",
  "#7c3aed",
  "#c026d3",
  "#db2777",
  "#dc2626",
  "#c2410c",
  "#a16207",
  "#15803d",
  "#0f766e",
  "#0369a1",
];

const ADJECTIVES = [
  "Quiet",
  "Brisk",
  "Clever",
  "Gentle",
  "Bold",
  "Calm",
  "Eager",
  "Merry",
  "Nimble",
  "Proud",
  "Swift",
  "Witty",
  "Lucky",
  "Sunny",
  "Steady",
  "Curious",
] as const;

const ANIMALS = [
  "Otter",
  "Heron",
  "Lynx",
  "Finch",
  "Badger",
  "Falcon",
  "Gecko",
  "Koala",
  "Marten",
  "Puffin",
  "Raven",
  "Tapir",
  "Wombat",
  "Zebra",
  "Ibis",
  "Orca",
] as const;

/**
 * A made-up person for someone who has not signed in: a name such as
 * "Quiet Otter" and a colour. `random` is `Math.random` or a stand-in for
 * it; the caller supplies the id.
 */
export function createGuest(random: () => number, id: string): PresenceUser {
  const pick = <T>(list: readonly T[]): T =>
    list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

  return {
    id,
    name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    color: pick(PRESENCE_COLORS),
  };
}

/** Up to two letters to show in place of a picture. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";

  return (
    words
      // By code point, so that a letter outside the basic plane stays whole.
      .map((word) => Array.from(word)[0]!.toUpperCase())
      .join("")
  );
}
