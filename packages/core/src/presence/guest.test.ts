import { describe, expect, it } from "vitest";
import { PRESENCE_COLORS, createGuest, initials, parseUser } from "./index";

/** Returns the given numbers in turn, as `Math.random` would. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

/** WCAG contrast ratio between a hex colour and white. */
function contrastWithWhite(color: string): number {
  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

describe("createGuest", () => {
  it("makes a user that passes the same checks as anyone else's", () => {
    const guest = createGuest(Math.random, "guest-abc");

    expect(parseUser(guest)).toEqual(guest);
    expect(guest.id).toBe("guest-abc");
  });

  it("gives a two-word name and a colour from the palette", () => {
    const guest = createGuest(sequence(0, 0, 0), "guest-abc");

    expect(guest.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(PRESENCE_COLORS).toContain(guest.color);
  });

  it("is decided by the random numbers alone", () => {
    const one = createGuest(sequence(0.1, 0.6, 0.9), "g");
    const two = createGuest(sequence(0.1, 0.6, 0.9), "g");
    const other = createGuest(sequence(0.9, 0.1, 0.2), "g");

    expect(one).toEqual(two);
    expect(other.name).not.toBe(one.name);
    expect(other.color).not.toBe(one.color);
  });

  it("copes with a random number at the very top of the range", () => {
    const guest = createGuest(sequence(0.999999999), "g");

    expect(parseUser(guest)).toEqual(guest);
  });
});

describe("PRESENCE_COLORS", () => {
  it("offers enough colours to tell a handful of people apart", () => {
    expect(new Set(PRESENCE_COLORS).size).toBe(PRESENCE_COLORS.length);
    expect(PRESENCE_COLORS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(PRESENCE_COLORS)("%s carries white text at AA contrast", (color) => {
    expect(contrastWithWhite(color)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Quiet Otter")).toBe("QO");
    expect(initials("ana maria lopez")).toBe("AM");
  });

  it("takes one letter from a single word", () => {
    expect(initials("Majd")).toBe("M");
  });

  it("ignores extra spaces", () => {
    expect(initials("  Quiet   Otter ")).toBe("QO");
  });

  it("keeps a letter outside the basic plane whole", () => {
    expect(initials("𝒜da Lovelace")).toBe("𝒜L");
  });

  it("works for names that are not in Latin script", () => {
    expect(initials("مجد الدين")).toBe("ما");
  });

  it("has a fallback for a name with nothing in it", () => {
    expect(initials("   ")).toBe("?");
  });
});
