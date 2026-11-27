/**
 * The width of a column, and of the space where a new one is added: 16rem,
 * so that four columns and "Add a column" fit in a 1280-pixel window.
 *
 * The same on every screen, on purpose. A pointer over the bare board is
 * sent as pixels from the board's corner (docs/decisions/0003), which only
 * lands in the same place on another screen if columns are as wide there.
 */
export const COLUMN_WIDTH = "w-64";
