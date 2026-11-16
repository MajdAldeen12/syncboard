/**
 * Shortest time between two presence messages from one client: about 15 a
 * second. A pointer reports its position far more often than that, and every
 * message the sync server receives counts against its daily allowance.
 */
export const PRESENCE_INTERVAL_MS = 66;

/** Time and timers, passed in so that tests can run them by hand. */
export interface ThrottleClock {
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface Throttle<T> {
  /** Offers a value. It is sent now, or held until the interval is up. */
  push(value: T): void;
  /** Drops a held value and its timer. */
  cancel(): void;
}

/**
 * Passes values on to `send` at most once per `intervalMs`.
 *
 * The first value after a pause goes out at once. Values that follow too
 * soon replace each other, and the latest goes out when the interval is up,
 * so the last value pushed always arrives. While nothing is pushed nothing
 * is sent and no timer runs.
 */
export function createThrottle<T>(
  intervalMs: number,
  send: (value: T) => void,
  clock: ThrottleClock,
): Throttle<T> {
  let lastSent: number | null = null;
  let held: { readonly value: T } | null = null;
  let timer: { readonly handle: unknown } | null = null;

  function sendNow(value: T): void {
    lastSent = clock.now();
    send(value);
  }

  return {
    push(value) {
      const now = clock.now();
      const due = lastSent === null ? now : lastSent + intervalMs;

      if (timer === null && now >= due) {
        sendNow(value);
        return;
      }

      held = { value };
      if (timer !== null) return;
      timer = {
        handle: clock.setTimer(() => {
          timer = null;
          const next = held;
          held = null;
          if (next) sendNow(next.value);
        }, due - now),
      };
    },

    cancel() {
      if (timer) clock.clearTimer(timer.handle);
      timer = null;
      held = null;
    },
  };
}
