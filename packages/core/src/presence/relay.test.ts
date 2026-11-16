import { describe, expect, it } from "vitest";
import { ownChanges } from "./index";

describe("ownChanges", () => {
  it("keeps the part of a change that is about this client", () => {
    expect(
      ownChanges({ added: [7], updated: [3, 9], removed: [4] }, 3),
    ).toEqual({ added: [], updated: [3], removed: [] });
  });

  it("is null when the change is only about other clients", () => {
    // What arrives from the server about other people must not be sent back.
    expect(
      ownChanges({ added: [7], updated: [9], removed: [4] }, 3),
    ).toBeNull();
  });

  it("keeps this client's own arrival and departure", () => {
    expect(ownChanges({ added: [3], updated: [], removed: [] }, 3)).toEqual({
      added: [3],
      updated: [],
      removed: [],
    });
    expect(ownChanges({ added: [], updated: [], removed: [3, 8] }, 3)).toEqual({
      added: [],
      updated: [],
      removed: [3],
    });
  });
});
