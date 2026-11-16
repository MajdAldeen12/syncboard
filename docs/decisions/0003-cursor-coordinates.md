# 0003: How a cursor position is described

- **Date:** 2026-11-16
- **Status:** accepted
- **Milestone:** M4

## Question

A pointer position has to mean the same thing on another person's screen. Screens differ:

- The board scrolls sideways once it is wider than the window, and windows have different sizes.
- Each column scrolls up and down on its own when it has more cards than fit.
- Card heights depend on how the title wraps, which depends on fonts and zoom.
- While someone drags, their own screen shows cards making room that nobody else sees yet.

The plan suggested board coordinates: pixels from the corner of the board's content.

## Options

1. **Window coordinates.** Wrong as soon as one of the two has scrolled or has a different window size.
2. **Board coordinates.** Pixels from the top-left corner of the board's content, wherever that corner has scrolled to. Right across window sizes and sideways scrolling, because columns have a fixed width. Wrong inside a column that has scrolled on its own (the same height on the board is a different card on each screen), and off by a few pixels per card wherever text wraps differently.
3. **Anchored to what the pointer is over.** The message names the card or column under the pointer and where on it, as fractions of that element's box. The receiver finds the same element on its own screen.

## Decision

**Option 3, with option 2 for the bare board.** `CursorPosition` in `packages/core/src/presence/types.ts`:

- over a card: `{ over: "card", id, x, y }`, `x` and `y` from 0 to 1 across the card;
- over a column but no card (header, gaps, the add-card row): `{ over: "column", id, x, y }`, fractions of the column;
- over neither: `{ over: "board", x, y }`, pixels from the corner of the board's content.

`describeCursor` writes one and `locateCursor` places one; both are pure and tested in `packages/core`. The DOM work around them is in `apps/web/src/features/presence`: `use-publish-cursor.ts` finds the element under the pointer, `cursor-overlay.tsx` finds that element here.

Why:

- What matters to the person watching is what the other is pointing at. "On this card" stays true through every difference listed above; a pixel position does not.
- It costs nothing in message size (an id and two short numbers) and little in code.
- A browser test opens the board in a 520-pixel window and a 1280-pixel one, scrolls the narrow one to the last column, and checks that each pointer lands on the same card in the other, within 3 pixels.

## Consequences

- **The pointer follows the card when this window scrolls.** No message arrives for that, so the overlay puts every pointer back in place on `scroll` and on resize, at once and without the glide.
- **A pointer over a card this screen does not have** (deleted a moment ago, not arrived yet) is hidden until it moves on.
- **A card scrolled out of its column here** is treated as being at the column's edge, so the pointer waits there instead of floating over the next column.
- **While dragging a card, the pointer is anchored to the column** it is over, not to a card: the cards around a held card shift on the dragger's screen only. While dragging a column, board coordinates are used.
- **Pointers jump a little when they cross from one element to the next** on screens laid out differently. The spring that smooths movement between messages hides it.
- **Pointers outside the visible part of the board are simply not visible**, as in a design tool. An edge marker ("Ana is to the right") could be added in M6.
- **Touch is not reported.** A finger is not a pointer that rests anywhere.
