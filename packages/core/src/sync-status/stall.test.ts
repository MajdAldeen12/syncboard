import { describe, expect, it } from "vitest";
import { createStallDetector } from "./index";

describe("createStallDetector", () => {
  it("does nothing while no attempt is in progress", () => {
    const stalled = createStallDetector(8_000);

    expect(stalled(false, 0)).toBe(false);
    expect(stalled(false, 60_000)).toBe(false);
  });

  it("gives an attempt the full time before calling it stalled", () => {
    const stalled = createStallDetector(8_000);

    expect(stalled(true, 1_000)).toBe(false);
    expect(stalled(true, 8_999)).toBe(false);
    expect(stalled(true, 9_000)).toBe(true);
  });

  it("times each attempt from when it was first seen, not from the last check", () => {
    const stalled = createStallDetector(8_000);

    for (let now = 0; now < 8_000; now += 500) {
      expect(stalled(true, now)).toBe(false);
    }
    expect(stalled(true, 8_000)).toBe(true);
  });

  it("starts the clock again for the next attempt", () => {
    const stalled = createStallDetector(8_000);
    stalled(true, 0);
    expect(stalled(true, 8_000)).toBe(true);

    // Reporting a stall ends that attempt; the retry gets its own time.
    expect(stalled(true, 8_500)).toBe(false);
    expect(stalled(true, 16_400)).toBe(false);
    expect(stalled(true, 16_500)).toBe(true);
  });

  it("forgets an attempt that finished in time", () => {
    const stalled = createStallDetector(8_000);
    stalled(true, 0);
    stalled(false, 3_000);

    expect(stalled(true, 9_000)).toBe(false);
    expect(stalled(true, 16_999)).toBe(false);
    expect(stalled(true, 17_000)).toBe(true);
  });
});
