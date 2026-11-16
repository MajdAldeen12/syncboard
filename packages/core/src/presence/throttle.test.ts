import { describe, expect, it } from "vitest";
import { PRESENCE_INTERVAL_MS, createThrottle } from "./index";
import { fakeClock } from "./testing";

function setUp(intervalMs = 100) {
  const clock = fakeClock();
  const sent: { value: number; at: number }[] = [];
  const throttle = createThrottle<number>(
    intervalMs,
    (value) => sent.push({ value, at: clock.now() }),
    clock,
  );
  return { clock, sent, throttle };
}

describe("createThrottle", () => {
  it("sends the first value at once", () => {
    const { sent, throttle } = setUp();

    throttle.push(1);

    expect(sent).toEqual([{ value: 1, at: 0 }]);
  });

  it("holds values that follow too soon and sends the latest when the time is up", () => {
    const { clock, sent, throttle } = setUp();
    throttle.push(1);

    clock.advance(30);
    throttle.push(2);
    clock.advance(30);
    throttle.push(3);
    expect(sent).toHaveLength(1);

    clock.advance(40);
    expect(sent).toEqual([
      { value: 1, at: 0 },
      { value: 3, at: 100 },
    ]);
  });

  it("sends at once again after a pause", () => {
    const { clock, sent, throttle } = setUp();
    throttle.push(1);

    clock.advance(500);
    throttle.push(2);

    expect(sent.at(-1)).toEqual({ value: 2, at: 500 });
  });

  it("measures the gap from the last send, held ones included", () => {
    const { clock, sent, throttle } = setUp();
    throttle.push(1);
    clock.advance(50);
    throttle.push(2);
    clock.advance(50);
    // Value 2 went out at 100. A push right after it must wait again.
    clock.advance(10);
    throttle.push(3);
    expect(sent).toHaveLength(2);

    clock.advance(90);
    expect(sent.at(-1)).toEqual({ value: 3, at: 200 });
  });

  it("never sends more often than the interval, however fast values arrive", () => {
    const { clock, sent, throttle } = setUp(PRESENCE_INTERVAL_MS);

    // A pointer reporting 250 times a second for two seconds.
    for (let elapsed = 0; elapsed < 2_000; elapsed += 4) {
      throttle.push(elapsed);
      clock.advance(4);
    }
    clock.advance(1_000);

    for (let index = 1; index < sent.length; index += 1) {
      expect(sent[index]!.at - sent[index - 1]!.at).toBeGreaterThanOrEqual(
        PRESENCE_INTERVAL_MS,
      );
    }
    // About 15 a second: 30 in two seconds, give or take the ends.
    expect(sent.length).toBeGreaterThanOrEqual(28);
    expect(sent.length).toBeLessThanOrEqual(32);
    // The last position is the one that arrives.
    expect(sent.at(-1)?.value).toBe(1_996);
  });

  it("sends nothing and keeps no timer while nothing is pushed", () => {
    const { clock, sent, throttle } = setUp();
    throttle.push(1);
    clock.advance(20);
    throttle.push(2);
    clock.advance(80);
    expect(sent).toHaveLength(2);

    clock.advance(60_000);

    expect(sent).toHaveLength(2);
    expect(clock.pending()).toBe(0);
  });

  it("drops a held value when cancelled", () => {
    const { clock, sent, throttle } = setUp();
    throttle.push(1);
    clock.advance(20);
    throttle.push(2);

    throttle.cancel();
    clock.advance(1_000);

    expect(sent).toHaveLength(1);
    expect(clock.pending()).toBe(0);
  });

  it("sets its interval to about 15 a second", () => {
    expect(1_000 / PRESENCE_INTERVAL_MS).toBeGreaterThan(14);
    expect(1_000 / PRESENCE_INTERVAL_MS).toBeLessThanOrEqual(15.5);
  });
});
