import { motion } from "motion/react";
import type { Transition } from "motion/react";
import { Board, type BoardMode } from "./Board";

/**
 * The persistent fixed-position layer that hosts the board across the
 * entire article. Position, scale, mode are driven by chapter sections
 * via GSAP ScrollTrigger updating the parent's stageView state.
 *
 * The board is rendered inside a relative container in the center of
 * the viewport; a transform shifts it to the requested viewport-relative
 * (x, y) position with the requested scale + rotation.
 */

export interface StageView {
  frameIdx: number;
  /** viewport-relative position 0..1 */
  x: number;
  y: number;
  /** scale of the board (1 = baseline 28vmin) */
  scale: number;
  /** rotation in degrees */
  rotate: number;
  /** opacity 0..1 */
  opacity: number;
  /** board visual mode */
  mode: BoardMode;
  /** when mode === "exploded", which cell pops */
  focusCell: number | null;
  /** for "heatmap" mode, per-cell intensity 0..1 */
  heatmap?: number[];
  /** ambient halo glow 0..1 */
  glow: number;
}

export const DEFAULT_VIEW: StageView = {
  frameIdx: 0,
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotate: 0,
  opacity: 1,
  mode: "standard",
  focusCell: null,
  glow: 0.4,
};

const SPRING: Transition = { type: "spring", stiffness: 110, damping: 20, mass: 1 };

interface Props {
  view: StageView;
  /** show the board behind content (negative z) or in front */
  z?: "back" | "front";
}

export function Stage({ view, z = "back" }: Props) {
  return (
    <div
      className="pf-stage pointer-events-none"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: z === "front" ? 5 : 1,
        contain: "layout paint size",
      }}
      aria-hidden
    >
      <motion.div
        className="pf-stage-board"
        animate={{
          left: `${view.x * 100}%`,
          top: `${view.y * 100}%`,
          scale: view.scale,
          rotate: view.rotate,
          opacity: view.opacity,
        }}
        transition={SPRING}
        style={{
          position: "absolute",
          width: "min(72vmin, 720px)",
          height: "min(72vmin, 720px)",
          translate: "-50% -50%",
          willChange: "transform, opacity",
        }}
      >
        <Board
          frameIdx={view.frameIdx}
          mode={view.mode}
          focusCell={view.focusCell}
          heatmap={view.heatmap}
          glow={view.glow}
          className="w-full h-full"
        />
      </motion.div>
    </div>
  );
}
