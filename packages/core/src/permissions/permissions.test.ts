import { describe, expect, it } from "vitest";
import { ACTIONS, ROLES, can, type Action, type Role } from "./index";

// The permission matrix, stated independently of the implementation.
const ALLOWED: Record<Role, readonly Action[]> = {
  viewer: ["board:read"],
  editor: ["board:read", "board:edit"],
  owner: [
    "board:read",
    "board:edit",
    "board:delete",
    "members:manage",
    "links:manage",
  ],
};

describe("can", () => {
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      const expected = ALLOWED[role].includes(action);

      it(`${role} ${expected ? "can" : "cannot"} ${action}`, () => {
        expect(can(role, action)).toBe(expected);
      });
    }
  }

  it("denies every action when there is no role", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it("denies roles it does not know, including object prototype keys", () => {
    expect(can("admin" as Role, "board:read")).toBe(false);
    expect(can("constructor" as Role, "board:read")).toBe(false);
    expect(can("__proto__" as Role, "board:read")).toBe(false);
  });

  it("denies actions it does not know", () => {
    expect(can("owner", "board:nuke" as Action)).toBe(false);
  });
});
