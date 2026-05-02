import { motion, AnimatePresence } from "motion/react";
import type { Transition } from "motion/react";
import { useMemo } from "react";
import {
  ALL_PIECE_IDS,
  TRACKED_FRAMES,
  pieceMap,
  type TrackedPiece,
} from "./pieces";

/**
 * The persistent SVG board. Pieces have stable identity across frames and
 * spring between cells with Motion. The whole board is a viewBox-anchored
 * SVG so the host (Stage) can scale/transform it freely without re-layout.
 *
 * Modes:
 *   "standard"  — vanilla 3×3 board, the default
 *   "exploded"  — one cell zooms forward; the others recede (used for the
 *                 fractal / what-is-pogo / inspect moments)
 *   "fanout"    — the board fans into 5 ghost copies behind it (variants)
 *   "heatmap"   — cells are tinted by a heatmap signal (per-cell intensity 0..1)
 */

export const CELL = 100;
export const GAP = 12;
export const PAD = 16;
export const VIEW = PAD * 2 + CELL * 3 + GAP * 2; // 16+12*2+100*3 = 340

const PIECE_RX = 36;
const PIECE_RY = 6.5;
const PIECE_TOP_HEIGHT = 13; // vertical stack offset between pieces

export type BoardMode = "standard" | "exploded" | "fanout" | "heatmap" | "ghost";

export interface BoardProps {
  /** 0..12 — the canonical frame in the story game. */
  frameIdx: number;
  /** Visual mode of the board. */
  mode?: BoardMode;
  /** When mode === "exploded", which cell pops forward (0..8). */
  focusCell?: number | null;
  /** When mode === "heatmap", per-cell intensity (0..1). */
  heatmap?: number[]; // length 9
  /** Soft glow tint behind the board. */
  glow?: number; // 0..1
  /** When true, suppress the spring (used for first paint to avoid flying-in pieces). */
  instant?: boolean;
  /** Optional aria label */
  label?: string;
  /** Class for SVG root (controls width) */
  className?: string;
  style?: React.CSSProperties;
}

/* ---------------- coordinate helpers ---------------- */

function cellOrigin(cell: number) {
  const row = Math.floor(cell / 3);
  const col = cell % 3;
  return {
    x: PAD + col * (CELL + GAP),
    y: PAD + row * (CELL + GAP),
  };
}

function cellCenter(cell: number) {
  const o = cellOrigin(cell);
  return { x: o.x + CELL / 2, y: o.y + CELL / 2 };
}

function pieceCoords(p: TrackedPiece) {
  const o = cellOrigin(p.cell);
  // pieces sit toward the bottom of the cell; stackIdx 0 is the lowest disc.
  // We center the stack: tall stacks shift up, single pieces sit at bottom.
  const cellBottomY = o.y + CELL - PIECE_RY * 2.2;
  const cy = cellBottomY - p.stackIdx * PIECE_TOP_HEIGHT;
  const cx = o.x + CELL / 2;
  return { cx, cy };
}

/* ---------------- the board ---------------- */

const SPRING: Transition = { type: "spring", stiffness: 220, damping: 24, mass: 1 };
const QUICK: Transition = { duration: 0.35, ease: [0.22, 0.6, 0.2, 1] };

export function Board({
  frameIdx,
  mode = "standard",
  focusCell = null,
  heatmap,
  glow = 0,
  instant = false,
  label,
  className = "",
  style,
}: BoardProps) {
  const frame = TRACKED_FRAMES[Math.max(0, Math.min(TRACKED_FRAMES.length - 1, frameIdx))]!;
  const map = useMemo(() => pieceMap(frame), [frame]);

  const transition = instant ? { duration: 0 } : SPRING;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role={label ? "img" : undefined}
      aria-label={label}
      className={`pf-board ${className}`}
      style={style}
    >
      <defs>
        {/* gradient on white pieces */}
        <linearGradient id="pf-white" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbf2da" />
          <stop offset="100%" stopColor="#cdc1a3" />
        </linearGradient>
        {/* gradient on red pieces */}
        <linearGradient id="pf-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ec6f4c" />
          <stop offset="100%" stopColor="#8b1d05" />
        </linearGradient>
        {/* drop shadow */}
        <filter id="pf-piece-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" />
          <feOffset dx="0" dy="2" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* cell inner gradient */}
        <radialGradient id="pf-cell-glow" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="rgba(236,226,203,0.06)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* vermilion glow filter */}
        <filter id="pf-vermilion-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.7" />
          </feComponentTransfer>
        </filter>
      </defs>

      {/* halo behind board */}
      <motion.circle
        cx={VIEW / 2}
        cy={VIEW / 2}
        r={VIEW * 0.55}
        fill="rgba(217,79,44,0.18)"
        filter="url(#pf-vermilion-glow)"
        animate={{ opacity: glow }}
        transition={QUICK}
      />

      {/* ghost copies for fanout */}
      {mode === "fanout" && (
        <g aria-hidden>
          {[-2, -1, 1, 2].map((idx) => (
            <g
              key={idx}
              transform={`translate(${idx * 28}, ${Math.abs(idx) * 14}) rotate(${idx * 2}, ${VIEW / 2}, ${VIEW / 2}) scale(0.9)`}
              opacity={0.18}
            >
              <BoardCells />
            </g>
          ))}
        </g>
      )}

      {/* cells */}
      <BoardCells heatmap={mode === "heatmap" ? heatmap : undefined} focusCell={mode === "exploded" ? focusCell : null} />

      {/* pieces, stable identity */}
      <g>
        <AnimatePresence>
          {ALL_PIECE_IDS.map((id) => {
            const p = map.get(id)!;
            const { cx, cy } = pieceCoords(p);
            const isWhite = p.color === "W";
            const focusScale =
              mode === "exploded" && focusCell != null && p.cell === focusCell ? 1.15 : 1;
            return (
              <motion.g
                key={id}
                initial={false}
                animate={{
                  x: cx,
                  y: cy,
                  scale: focusScale,
                }}
                transition={transition}
                style={{ originX: "0px", originY: "0px" } as React.CSSProperties}
              >
                {/* shadow disc */}
                <ellipse
                  cx={0}
                  cy={PIECE_RY * 0.6}
                  rx={PIECE_RX * 0.92}
                  ry={PIECE_RY * 0.5}
                  fill="rgba(0,0,0,0.45)"
                />
                {/* body — ellipse top */}
                <ellipse
                  cx={0}
                  cy={0}
                  rx={PIECE_RX}
                  ry={PIECE_RY}
                  fill={isWhite ? "url(#pf-white)" : "url(#pf-red)"}
                  filter="url(#pf-piece-shadow)"
                />
                {/* highlight strip */}
                <ellipse
                  cx={0}
                  cy={-PIECE_RY * 0.6}
                  rx={PIECE_RX * 0.7}
                  ry={PIECE_RY * 0.25}
                  fill={isWhite ? "rgba(255,255,255,0.55)" : "rgba(255,180,160,0.4)"}
                />
              </motion.g>
            );
          })}
        </AnimatePresence>
      </g>
    </svg>
  );
}

/* ---------------- the cells (separated for ghost reuse) ---------------- */

function BoardCells({
  heatmap,
  focusCell,
}: { heatmap?: number[]; focusCell?: number | null } = {}) {
  return (
    <g>
      {Array.from({ length: 9 }).map((_, cell) => {
        const o = cellOrigin(cell);
        const heat = heatmap?.[cell] ?? 0;
        const isFocus = focusCell === cell;
        const heatFill = heat > 0
          ? `rgba(217,79,44,${0.06 + heat * 0.5})`
          : "rgba(20,16,13,0.95)";
        return (
          <g key={cell}>
            <motion.rect
              x={o.x}
              y={o.y}
              width={CELL}
              height={CELL}
              rx={4}
              fill={heatFill}
              stroke="rgba(217,79,44,0.10)"
              strokeWidth={1}
              animate={{
                scale: isFocus ? 1.06 : 1,
                opacity: focusCell != null && !isFocus ? 0.45 : 1,
              }}
              style={{ originX: `${o.x + CELL / 2}px`, originY: `${o.y + CELL / 2}px` } as React.CSSProperties}
              transition={QUICK}
            />
            {/* cell inner gradient */}
            <rect
              x={o.x}
              y={o.y}
              width={CELL}
              height={CELL}
              rx={4}
              fill="url(#pf-cell-glow)"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}

export { cellCenter, cellOrigin };
