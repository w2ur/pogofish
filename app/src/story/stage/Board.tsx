import { motion, AnimatePresence } from "motion/react";
import type { Transition } from "motion/react";
import { useMemo, useRef } from "react";
import {
  ALL_PIECE_IDS,
  TRACKED_FRAMES,
  pieceMap,
  type TrackedPiece,
} from "./pieces";
import { useAct, type Act } from "../useAct";

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
  /**
   * Force an act override. If omitted, the board reads its current act
   * from the closest `data-act` ancestor (or `<html data-act>`). The
   * board's visual character then metamorphoses:
   *   1 = sketchy ink on cream paper (no cell fill, hatched pieces)
   *   2 = ASCII / debug-viz on terminal (W/R letters in phosphor boxes)
   *   3 = clean published figure (flat chits, soft drop shadow)
   */
  act?: Act;
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
  act: actProp,
}: BoardProps) {
  const frame = TRACKED_FRAMES[Math.max(0, Math.min(TRACKED_FRAMES.length - 1, frameIdx))]!;
  const map = useMemo(() => pieceMap(frame), [frame]);
  const svgRef = useRef<SVGSVGElement>(null);
  // Read current act when not explicitly passed; keeps consumers (Stage,
  // TryYourself, PlayScene, Learnings) from having to plumb the prop.
  const detectedAct = useAct(svgRef as unknown as React.RefObject<HTMLElement | null>);
  const act: Act = actProp ?? detectedAct;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role={label ? "img" : undefined}
      aria-label={label}
      className={`pf-board pf-board-act-${act} ${className}`}
      style={style}
      data-board-act={act}
    >
      <defs>
        {/* gradient on white pieces — driven by act tokens */}
        <linearGradient id="pf-white" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--board-piece-w-from)" }} />
          <stop offset="100%" style={{ stopColor: "var(--board-piece-w-to)" }} />
        </linearGradient>
        {/* gradient on red pieces — driven by act tokens */}
        <linearGradient id="pf-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--board-piece-r-from)" }} />
          <stop offset="100%" style={{ stopColor: "var(--board-piece-r-to)" }} />
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
        {/* cell inner highlight — driven by act tokens */}
        <radialGradient id="pf-cell-glow" cx="50%" cy="0%" r="80%">
          <stop offset="0%" style={{ stopColor: "var(--board-cell-highlight)" }} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* halo glow filter */}
        <filter id="pf-vermilion-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.7" />
          </feComponentTransfer>
        </filter>
      </defs>

      {/* halo behind board — driven by act tokens */}
      <motion.circle
        cx={VIEW / 2}
        cy={VIEW / 2}
        r={VIEW * 0.55}
        fill="var(--board-halo)"
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
              <BoardCells act={act} />
            </g>
          ))}
        </g>
      )}

      {/* cells */}
      <BoardCells
        act={act}
        heatmap={mode === "heatmap" ? heatmap : undefined}
        focusCell={mode === "exploded" ? focusCell : null}
      />

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
              <Piece
                key={id}
                cx={cx}
                cy={cy}
                isWhite={isWhite}
                focusScale={focusScale}
                instant={instant}
                act={act}
              />
            );
          })}
        </AnimatePresence>
      </g>
    </svg>
  );
}

/* ---------------- the piece (hop animation) ---------------- */

const HOP_HEIGHT = 36;        // pixels in viewBox space the piece lifts mid-arc
const HOP_DURATION = 0.55;    // seconds for full hop
const SETTLE_SPRING: Transition = { type: "spring", stiffness: 180, damping: 18, mass: 1 };

function Piece({
  cx,
  cy,
  isWhite,
  focusScale,
  instant,
  act,
}: {
  cx: number;
  cy: number;
  isWhite: boolean;
  focusScale: number;
  instant: boolean;
  act: Act;
}) {
  // track previous (rendered) position so we can build an arc on each move
  const prev = useRef({ x: cx, y: cy });
  const px = prev.current.x;
  const py = prev.current.y;
  const moved = !instant && (Math.abs(px - cx) > 0.5 || Math.abs(py - cy) > 0.5);
  // commit the new "previous" for next render — runs after this animate target
  // is captured by Motion.
  prev.current = { x: cx, y: cy };

  // The peak of the arc: lift over the higher endpoint by HOP_HEIGHT.
  // For pure stack changes (same cell), use a shorter lift so it feels like
  // a settle rather than a leap.
  const sameCell = Math.abs(px - cx) < 0.5;
  const peakY = Math.min(py, cy) - (sameCell ? HOP_HEIGHT * 0.3 : HOP_HEIGHT);

  return (
    <motion.g
      initial={false}
      animate={
        moved
          ? {
              x: [px, cx],
              y: [py, peakY, cy],
              scale: [1, 1.06, focusScale],
            }
          : { x: cx, y: cy, scale: focusScale }
      }
      transition={
        moved
          ? {
              x: { duration: HOP_DURATION, ease: [0.45, 0.05, 0.55, 0.95] },
              y: { duration: HOP_DURATION, times: [0, 0.5, 1], ease: ["easeOut", "easeIn"] },
              scale: { duration: HOP_DURATION, times: [0, 0.5, 1] },
            }
          : SETTLE_SPRING
      }
      style={{ originX: "0px", originY: "0px" } as React.CSSProperties}
    >
      {/* contact shadow under piece — softens when piece is mid-arc (lift illusion) */}
      <motion.ellipse
        cx={0}
        cy={PIECE_RY * 0.6}
        ry={PIECE_RY * 0.5}
        fill="rgba(0,0,0,0.5)"
        initial={{ rx: PIECE_RX * 0.92, opacity: act === 2 ? 0 : 0.5 }}
        animate={
          moved
            ? {
                rx: [PIECE_RX * 0.92, PIECE_RX * 1.3, PIECE_RX * 0.92],
                opacity:
                  act === 2 ? [0, 0, 0] : [0.5, 0.18, 0.5],
              }
            : { rx: PIECE_RX * 0.92, opacity: act === 2 ? 0 : 0.5 }
        }
        transition={
          moved
            ? { duration: HOP_DURATION, times: [0, 0.5, 1] }
            : { duration: 0.2 }
        }
      />
      {act === 1 ? (
        <PieceSketch isWhite={isWhite} />
      ) : act === 2 ? (
        <PieceAscii isWhite={isWhite} />
      ) : (
        <PieceClean isWhite={isWhite} />
      )}
    </motion.g>
  );
}

/** Act 1 — pencil ink on cream paper. No fill, ring + diagonal hatch
 *  inside (suggests a coin sketched in a notebook). */
function PieceSketch({ isWhite }: { isWhite: boolean }) {
  const stroke = isWhite ? "var(--board-piece-w-from)" : "var(--board-piece-r-from)";
  return (
    <g>
      {/* outer ring */}
      <ellipse
        cx={0}
        cy={0}
        rx={PIECE_RX}
        ry={PIECE_RY}
        fill="none"
        stroke={stroke}
        strokeWidth={2.4}
      />
      {/* inner concentric ring */}
      <ellipse
        cx={0}
        cy={0}
        rx={PIECE_RX * 0.65}
        ry={PIECE_RY * 0.65}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        opacity={0.6}
      />
      {/* short diagonal hatch — gives a "shaded" feel without filling */}
      {!isWhite && (
        <g stroke={stroke} strokeWidth={0.9} opacity={0.55}>
          {[-PIECE_RX * 0.55, -PIECE_RX * 0.2, PIECE_RX * 0.15, PIECE_RX * 0.5].map(
            (x, i) => (
              <line
                key={i}
                x1={x - 4}
                y1={-PIECE_RY * 0.4}
                x2={x + 4}
                y2={PIECE_RY * 0.4}
              />
            ),
          )}
        </g>
      )}
    </g>
  );
}

/** Act 2 — debug viz on a terminal screen. Phosphor-green ASCII boxes
 *  with the piece rendered as a single monospace letter. */
function PieceAscii({ isWhite }: { isWhite: boolean }) {
  const color = "var(--board-piece-r-from)"; // act-2 token resolves to phosphor green for both colors with a neutral mark
  // We distinguish W vs R by the letter, not the color. Pure phosphor is
  // act-2's unified accent — pieces are W/R glyphs, not coloured discs.
  const fg = isWhite ? "var(--board-piece-w-from)" : color;
  return (
    <g>
      {/* tight square outline around the letter — like a debug bbox */}
      <rect
        x={-PIECE_RX * 0.55}
        y={-PIECE_RX * 0.55}
        width={PIECE_RX * 1.1}
        height={PIECE_RX * 1.1}
        fill="none"
        stroke={fg}
        strokeWidth={1.3}
        opacity={0.7}
      />
      <text
        x={0}
        y={2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontWeight={700}
        fontSize={PIECE_RX * 0.95}
        fill={fg}
      >
        {isWhite ? "W" : "R"}
      </text>
    </g>
  );
}

/** Act 3 — published-paper figure. Flat colored disc, soft drop shadow,
 *  no rim highlight gymnastics — calm, quiet, archival. */
function PieceClean({ isWhite }: { isWhite: boolean }) {
  return (
    <g filter="url(#pf-piece-shadow)">
      <ellipse
        cx={0}
        cy={0}
        rx={PIECE_RX}
        ry={PIECE_RY}
        fill={isWhite ? "url(#pf-white)" : "url(#pf-red)"}
      />
      {/* a single thin top hairline — gives the chit a printed look */}
      <ellipse
        cx={0}
        cy={-PIECE_RY * 0.55}
        rx={PIECE_RX * 0.78}
        ry={PIECE_RY * 0.1}
        fill={isWhite ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)"}
      />
    </g>
  );
}

/* ---------------- the cells (separated for ghost reuse) ---------------- */

function BoardCells({
  act = 1,
  heatmap,
  focusCell,
}: { act?: Act; heatmap?: number[]; focusCell?: number | null } = {}) {
  return (
    <g>
      {Array.from({ length: 9 }).map((_, cell) => {
        const o = cellOrigin(cell);
        const heat = heatmap?.[cell] ?? 0;
        const isFocus = focusCell === cell;
        // Empty cells use the act's empty-cell token; heatmap cells override
        // with a vermilion-tinted intensity (the heatmap accent stays
        // vermilion regardless of act so heatmap insights read consistently
        // as "this is where the network looked.")
        const heatFill =
          heat > 0
            ? `rgba(217,79,44,${0.06 + heat * 0.5})`
            : "var(--board-cell-empty)";
        const cx = o.x + CELL / 2;
        const cy = o.y + CELL / 2;
        return (
          <g key={cell}>
            {act === 1 ? (
              <CellSketch
                ox={o.x}
                oy={o.y}
                cell={cell}
                heatFill={heatFill}
                isFocus={isFocus}
                dimmed={focusCell != null && !isFocus}
              />
            ) : act === 2 ? (
              <CellAscii
                ox={o.x}
                oy={o.y}
                cell={cell}
                heatFill={heatFill}
                isFocus={isFocus}
                dimmed={focusCell != null && !isFocus}
              />
            ) : (
              <motion.rect
                x={o.x}
                y={o.y}
                width={CELL}
                height={CELL}
                rx={4}
                fill={heatFill}
                stroke="var(--board-cell-stroke)"
                strokeWidth={1}
                filter="url(#pf-piece-shadow)"
                animate={{
                  scale: isFocus ? 1.06 : 1,
                  opacity: focusCell != null && !isFocus ? 0.45 : 1,
                }}
                style={{
                  originX: `${cx}px`,
                  originY: `${cy}px`,
                } as React.CSSProperties}
                transition={QUICK}
              />
            )}
            {/* cell inner gradient — kept on every act for consistent depth */}
            {act !== 2 && (
              <rect
                x={o.x}
                y={o.y}
                width={CELL}
                height={CELL}
                rx={4}
                fill="url(#pf-cell-glow)"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Act 1 cell — sketchy, no fill, slightly imperfect rounded corners.
 *  The "wobble" comes from a path with control points offset per cell so
 *  no two cells look identical (mimics a hand drawing). */
function CellSketch({
  ox,
  oy,
  cell,
  heatFill,
  isFocus,
  dimmed,
}: {
  ox: number;
  oy: number;
  cell: number;
  heatFill: string;
  isFocus: boolean;
  dimmed: boolean;
}) {
  // Per-cell jitter, deterministic, gives each cell a unique slight wobble.
  const seed = (cell * 9301 + 49297) % 233280;
  const j = (n: number) => ((seed >> (n * 3)) & 7) / 7 - 0.5; // [-0.5, 0.5)
  const w = (mul: number) => mul * 3; // up to ±1.5 px wobble
  const x1 = ox + w(j(0));
  const y1 = oy + w(j(1));
  const x2 = ox + CELL + w(j(2));
  const y2 = oy + w(j(3));
  const x3 = ox + CELL + w(j(4));
  const y3 = oy + CELL + w(j(5));
  const x4 = ox + w(j(6));
  const y4 = oy + CELL + w(j(7));
  const path = `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} Z`;
  return (
    <motion.g
      animate={{
        scale: isFocus ? 1.06 : 1,
        opacity: dimmed ? 0.45 : 1,
      }}
      style={{
        originX: `${ox + CELL / 2}px`,
        originY: `${oy + CELL / 2}px`,
      } as React.CSSProperties}
      transition={QUICK}
    >
      {/* heatmap fill — kept under the sketch so the network's interest
          still reads on the sketchy paper */}
      {heatFill !== "var(--board-cell-empty)" && (
        <path d={path} fill={heatFill} />
      )}
      <path
        d={path}
        fill="none"
        stroke="var(--board-cell-stroke)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </motion.g>
  );
}

/** Act 2 cell — phosphor outline with corner brackets, debug-viz feel.
 *  Cells render dark (terminal black) with a green stroke; the corner
 *  ticks evoke ASCII-rendered boxes. */
function CellAscii({
  ox,
  oy,
  cell,
  heatFill,
  isFocus,
  dimmed,
}: {
  ox: number;
  oy: number;
  cell: number;
  heatFill: string;
  isFocus: boolean;
  dimmed: boolean;
}) {
  const tick = 8;
  const corners = [
    // top-left
    `M ${ox} ${oy + tick} L ${ox} ${oy} L ${ox + tick} ${oy}`,
    // top-right
    `M ${ox + CELL - tick} ${oy} L ${ox + CELL} ${oy} L ${ox + CELL} ${oy + tick}`,
    // bottom-right
    `M ${ox + CELL} ${oy + CELL - tick} L ${ox + CELL} ${oy + CELL} L ${ox + CELL - tick} ${oy + CELL}`,
    // bottom-left
    `M ${ox + tick} ${oy + CELL} L ${ox} ${oy + CELL} L ${ox} ${oy + CELL - tick}`,
  ];
  return (
    <motion.g
      animate={{
        scale: isFocus ? 1.06 : 1,
        opacity: dimmed ? 0.45 : 1,
      }}
      style={{
        originX: `${ox + CELL / 2}px`,
        originY: `${oy + CELL / 2}px`,
      } as React.CSSProperties}
      transition={QUICK}
    >
      {/* matte fill — terminal black */}
      <rect
        x={ox}
        y={oy}
        width={CELL}
        height={CELL}
        fill={heatFill}
      />
      {/* dotted-line guide rule, gives the grid a screen-readout feel */}
      <rect
        x={ox}
        y={oy}
        width={CELL}
        height={CELL}
        fill="none"
        stroke="var(--board-cell-stroke)"
        strokeWidth={0.7}
        strokeDasharray="2 4"
        opacity={0.55}
      />
      {/* corner brackets in solid stroke */}
      {corners.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--board-cell-stroke)"
          strokeWidth={1.5}
          strokeLinejoin="miter"
          strokeLinecap="square"
        />
      ))}
      {/* tiny coordinate label (debug viz tradition) */}
      <text
        x={ox + 4}
        y={oy + 11}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontSize={8}
        fill="var(--board-cell-stroke)"
        opacity={0.55}
      >
        {`[${Math.floor(cell / 3)},${cell % 3}]`}
      </text>
    </motion.g>
  );
}

export { cellCenter, cellOrigin };
