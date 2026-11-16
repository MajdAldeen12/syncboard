import { describe, expect, it } from "vitest";
import { describeCursor, locateCursor, type Box } from "./index";

const ORIGIN = { x: 16, y: 80 };

function boxes(known: Record<string, Box>) {
  return (over: "card" | "column", id: string) =>
    known[`${over}:${id}`] ?? null;
}

describe("describeCursor", () => {
  it("places a pointer over a card as a fraction of the card", () => {
    const cursor = describeCursor(
      { x: 150, y: 220 },
      {
        over: "card",
        id: "c1",
        box: { left: 100, top: 200, width: 200, height: 40 },
      },
      ORIGIN,
    );

    expect(cursor).toEqual({ over: "card", id: "c1", x: 0.25, y: 0.5 });
  });

  it("places a pointer over a column as a fraction of the column", () => {
    const cursor = describeCursor(
      { x: 388, y: 100 },
      {
        over: "column",
        id: "col1",
        box: { left: 100, top: 100, width: 288, height: 600 },
      },
      ORIGIN,
    );

    expect(cursor).toEqual({ over: "column", id: "col1", x: 1, y: 0 });
  });

  it("places a pointer over neither in pixels from the board's corner", () => {
    expect(describeCursor({ x: 1216.4, y: 380.6 }, null, ORIGIN)).toEqual({
      over: "board",
      x: 1200,
      y: 301,
    });
  });

  it("counts from the board's corner even when it is scrolled out of view", () => {
    // Scrolled 500 px to the right: the corner is left of the window.
    expect(
      describeCursor({ x: 100, y: 100 }, null, { x: -484, y: 80 }),
    ).toEqual({ over: "board", x: 584, y: 20 });
  });

  it("keeps the fractions short", () => {
    const cursor = describeCursor(
      { x: 100 + 288 / 3, y: 100 },
      {
        over: "column",
        id: "col1",
        box: { left: 100, top: 100, width: 288, height: 600 },
      },
      ORIGIN,
    );

    expect(cursor).toEqual({ over: "column", id: "col1", x: 0.3333, y: 0 });
  });

  it("does not divide by an empty box", () => {
    const cursor = describeCursor(
      { x: 5, y: 5 },
      { over: "card", id: "c1", box: { left: 0, top: 0, width: 0, height: 0 } },
      ORIGIN,
    );

    expect(cursor).toEqual({ over: "card", id: "c1", x: 0, y: 0 });
  });
});

describe("locateCursor", () => {
  it("finds the same spot on a card that is somewhere else here", () => {
    // The same card on a screen where it sits lower and the text wraps more.
    const point = locateCursor(
      { over: "card", id: "c1", x: 0.25, y: 0.5 },
      boxes({ "card:c1": { left: 400, top: 500, width: 200, height: 80 } }),
      ORIGIN,
    );

    expect(point).toEqual({ x: 450, y: 540 });
  });

  it("finds a spot on a column", () => {
    const point = locateCursor(
      { over: "column", id: "col1", x: 0.5, y: 0.1 },
      boxes({ "column:col1": { left: 0, top: 100, width: 288, height: 500 } }),
      ORIGIN,
    );

    expect(point).toEqual({ x: 144, y: 150 });
  });

  it("finds a spot on the board from its corner", () => {
    expect(
      locateCursor({ over: "board", x: 1200, y: 300 }, boxes({}), {
        x: -484,
        y: 80,
      }),
    ).toEqual({ x: 716, y: 380 });
  });

  it("has no answer when the card or column is not on this screen", () => {
    expect(
      locateCursor(
        { over: "card", id: "gone", x: 0.5, y: 0.5 },
        boxes({}),
        ORIGIN,
      ),
    ).toBeNull();
  });

  it("round-trips a pointer between two screens that lay the board out alike", () => {
    const card = { left: 320, top: 140, width: 272, height: 36 };
    const target = { over: "card", id: "c1", box: card } as const;
    const pointer = { x: 401, y: 157 };

    const point = locateCursor(
      describeCursor(pointer, target, ORIGIN),
      boxes({ "card:c1": card }),
      ORIGIN,
    );

    expect(point?.x).toBeCloseTo(pointer.x, 0);
    expect(point?.y).toBeCloseTo(pointer.y, 0);
  });
});
