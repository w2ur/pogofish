// cellCentre: the point drawBoard centres a stack on, for figures that draw over a board.
import { describe, expect, it } from 'vitest';
import type { State } from '../engine';
import { cellCentre, drawBoard } from './board-svg';

const one = (cell: number): State => ({ cells: Array.from({ length: 9 }, (_, i) => (i === cell ? ['Red'] : [])), to_move: 'Red', move_count: 0, history: [] });

describe('cellCentre', () => {
  it('is where drawBoard puts a single disc, with and without room for the labels', () => {
    for (const labelRoom of [false, true]) {
      for (let cell = 0; cell < 9; cell++) {
        const disc = drawBoard(one(cell), { labelRoom }).querySelector('.disc')!;
        expect(cellCentre(cell, labelRoom)).toEqual([Number(disc.getAttribute('cx')), Number(disc.getAttribute('cy'))]);
      }
    }
  });

  it('puts a1 at the bottom left and c3 at the top right', () => {
    expect(cellCentre(0)).toEqual([50, 250]);
    expect(cellCentre(8)).toEqual([250, 50]);
  });
});
