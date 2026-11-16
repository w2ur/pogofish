// Which rows a table of moves shows (<pogo-net kind="az">, <pogo-search>): at
// most ten, in an order that does not change while the figure steps (the
// net's preference), so a row never jumps; the rest go behind a closed
// disclosure. The move the search would play is always shown: when it ranks
// below the ten, it takes the last visible place.

export const VISIBLE_MOVES = 10;

export function splitRows(order: readonly number[], keep: number | null, limit = VISIBLE_MOVES): { shown: number[]; hidden: number[] } {
  let shown = order.slice(0, limit);
  if (keep !== null && order.includes(keep) && !shown.includes(keep)) shown = [...order.slice(0, limit - 1), keep];
  return { shown, hidden: order.filter((i) => !shown.includes(i)) };
}
