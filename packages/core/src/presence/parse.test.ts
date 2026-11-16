import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, parsePresence, parseUser } from "./index";

const USER = { id: "guest-1", name: "Quiet Otter", color: "#2563eb" };

describe("parseUser", () => {
  it("accepts an id, a name and a six-digit hex colour", () => {
    expect(parseUser(USER)).toEqual(USER);
  });

  it("drops anything else it was given", () => {
    expect(parseUser({ ...USER, role: "owner" })).toEqual(USER);
  });

  it("trims the name and cuts one that is too long", () => {
    expect(parseUser({ ...USER, name: "  Otter  " })?.name).toBe("Otter");
    expect(parseUser({ ...USER, name: "x".repeat(500) })?.name).toHaveLength(
      MAX_NAME_LENGTH,
    );
  });

  it("writes the colour in lower case", () => {
    expect(parseUser({ ...USER, color: "#2563EB" })?.color).toBe("#2563eb");
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "Quiet Otter"],
    ["a missing id", { name: "Otter", color: "#2563eb" }],
    ["an empty id", { ...USER, id: "" }],
    ["an id that is too long", { ...USER, id: "x".repeat(65) }],
    ["a blank name", { ...USER, name: "   " }],
    ["a name that is not text", { ...USER, name: 7 }],
    ["a named colour", { ...USER, color: "red" }],
    // A colour is put into a style attribute; nothing but a plain hex value
    // may get that far.
    ["a colour carrying CSS", { ...USER, color: "#fff;background:url(x)" }],
    ["a short hex colour", { ...USER, color: "#fff" }],
  ])("refuses %s", (_label, value) => {
    expect(parseUser(value)).toBeNull();
  });
});

describe("parsePresence", () => {
  const IDLE = { user: USER, cursor: null, editing: null, dragging: null };

  it("accepts someone who is just looking", () => {
    expect(parsePresence(IDLE)).toEqual(IDLE);
  });

  it("fills in what was left out", () => {
    expect(parsePresence({ user: USER })).toEqual(IDLE);
  });

  it("refuses a state without a usable user", () => {
    expect(parsePresence({ ...IDLE, user: { ...USER, color: "red" } })).toBe(
      null,
    );
    expect(parsePresence({})).toBeNull();
    expect(parsePresence(null)).toBeNull();
    expect(parsePresence("hello")).toBeNull();
  });

  it("accepts a cursor over a card, a column or the board", () => {
    for (const cursor of [
      { over: "card", id: "c1", x: 0.25, y: 0.5 },
      { over: "column", id: "col1", x: 1, y: 0 },
      { over: "board", x: 1200, y: 340 },
    ]) {
      expect(parsePresence({ ...IDLE, cursor })?.cursor).toEqual(cursor);
    }
  });

  it("keeps a cursor inside what it is over", () => {
    expect(
      parsePresence({
        ...IDLE,
        cursor: { over: "card", id: "c1", x: -3, y: 1.5 },
      })?.cursor,
    ).toEqual({ over: "card", id: "c1", x: 0, y: 1 });
    expect(
      parsePresence({ ...IDLE, cursor: { over: "board", x: -40, y: 1e12 } })
        ?.cursor,
    ).toEqual({ over: "board", x: 0, y: 100_000 });
  });

  it.each([
    ["an unknown target", { over: "window", x: 1, y: 1 }],
    ["a card without an id", { over: "card", x: 0.5, y: 0.5 }],
    ["a position that is not a number", { over: "board", x: "1", y: 2 }],
    ["a position that is not finite", { over: "board", x: Infinity, y: 2 }],
    ["NaN", { over: "card", id: "c1", x: NaN, y: 0 }],
    ["a string", "top left"],
  ])("shows the person without a cursor when it is %s", (_label, cursor) => {
    const parsed = parsePresence({ ...IDLE, cursor });

    expect(parsed?.user).toEqual(USER);
    expect(parsed?.cursor).toBeNull();
  });

  it("accepts what is being edited and what is being dragged", () => {
    const parsed = parsePresence({
      ...IDLE,
      editing: { kind: "card", id: "c1" },
      dragging: { kind: "column", id: "col2" },
    });

    expect(parsed?.editing).toEqual({ kind: "card", id: "c1" });
    expect(parsed?.dragging).toEqual({ kind: "column", id: "col2" });
  });

  it("ignores an item it cannot make sense of", () => {
    const parsed = parsePresence({
      ...IDLE,
      editing: { kind: "board", id: "b" },
      dragging: { kind: "card", id: 12 },
    });

    expect(parsed?.editing).toBeNull();
    expect(parsed?.dragging).toBeNull();
  });
});
