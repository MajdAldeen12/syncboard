import {
  createGuest,
  parseUser,
  type PresenceUser,
} from "@syncboard/core/presence";

const STORAGE_KEY = "syncboard:guest";

function randomId(): string {
  // Not `crypto.randomUUID`: that one only exists on secure origins, and a
  // phone on the local network reaches a dev server over plain HTTP.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Who this browser is on a board while there is no sign-in: a made-up name
 * and colour, kept in this browser's storage so that a return visit is the
 * same person.
 *
 * This is the only place that knows about guests. Everything else takes a
 * `PresenceUser`, so a signed-in user (M5) is passed in instead of this.
 * Browser only: do not call it while rendering on the server.
 */
export function loadGuest(): PresenceUser {
  try {
    const stored = parseUser(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
    );
    if (stored) return stored;
  } catch {
    // Storage is blocked or holds something unreadable. Start afresh.
  }

  const guest = createGuest(Math.random, `guest-${randomId()}`);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  } catch {
    // Private browsing in some browsers. The guest lasts for this visit.
  }
  return guest;
}
