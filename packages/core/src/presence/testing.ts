// Test support, not part of the package's API.

import type { ThrottleClock } from "./throttle";

export interface FakeClock extends ThrottleClock {
  /** How many timers are waiting. */
  pending(): number;
  /** Moves time forward, running the timers that come due on the way. */
  advance(ms: number): void;
}

/** A clock the test moves by hand, with the timers that hang off it. */
export function fakeClock(): FakeClock {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; run: () => void }>();

  return {
    now: () => now,
    setTimer(run, ms) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + ms, run });
      return handle;
    },
    clearTimer(handle) {
      timers.delete(handle as number);
    },
    pending: () => timers.size,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].run();
      }
      now = end;
    },
  };
}
