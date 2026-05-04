import { useRef } from "react";
import { motion } from "motion/react";
import { useAct } from "./useAct";

type Variant = "auto" | "pencil" | "terminal" | "footnote";

type Props = {
  children: React.ReactNode;
  /** Force a variant. Default "auto" picks one from the surrounding act. */
  variant?: Variant;
  /** Optional one-word stamp shown above the body, e.g. "[D2 14:32]" or
   *  "note." — small, mono, in the accent color. */
  stamp?: string;
  /** Slight horizontal nudge for hand-drawn chaos. Defaults vary per act. */
  rotate?: number;
};

/** A side-margin annotation that floats out of the prose column into the
 *  right gutter on desktop and stacks below the prose on mobile.
 *
 *  The visual register changes per act so the article's marginalia age
 *  with the rest of the page:
 *
 *  · Act 1 — pencil-red italic in the display face, slight rotation,
 *    a thin vermilion bracket on the left. Looks hand-scrawled.
 *  · Act 2 — phosphor-green monospace, optional uppercase stamp, on a
 *    faint tinted block. Looks like a terminal log line.
 *  · Act 3 — small navy italic with a thin horizontal rule above.
 *    Looks like a footnote in a published monograph.
 *
 *  Authors place these inside a NarrativePanel (or any prose stream) at
 *  the rough vertical position they want. The float clears itself, so
 *  marginalia in close succession stack without overlapping. */
export function Marginalia({ children, variant = "auto", stamp, rotate }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const detected = useAct(ref);
  const v: Exclude<Variant, "auto"> =
    variant !== "auto"
      ? variant
      : detected === 2
      ? "terminal"
      : detected === 3
      ? "footnote"
      : "pencil";

  // Tiny per-variant rotation default. Pencil leans into the
  // hand-drawn feel; the others stay upright.
  const r = rotate ?? (v === "pencil" ? -0.6 : 0);

  return (
    <motion.aside
      ref={ref}
      initial={{ opacity: 0, x: 10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`marginalia marginalia--${v}`}
      style={r ? { transform: `rotate(${r}deg)` } : undefined}
    >
      {stamp ? <span className="marginalia__stamp">{stamp}</span> : null}
      <span className="marginalia__body">{children}</span>
    </motion.aside>
  );
}
