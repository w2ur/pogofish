import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export type ActNumber = 1 | 2 | 3;

interface ActProps {
  /** Which act this section belongs to. Drives the local CSS theme. */
  act: ActNumber;
  /**
   * If true, mounts a scroll observer that promotes this act onto the
   * <html> root while the section is the active one. Use only on
   * top-level sections — fixed chrome (header, palette switcher, etc.)
   * reads from the root attribute to follow the act through transitions.
   */
  global?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a section of the article in a single act's theme. Sets
 * `data-act` so all CSS variables under this element resolve to the
 * act's color and texture tokens. Acts also ship their own surface
 * texture (paper grain / terminal scanlines / printed-page grain)
 * which is rendered by the .act-surface ::before pseudo-element.
 */
export function Act({ act, global = false, className = "", children }: ActProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!global) return;
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Activate when the section's middle band is near viewport center —
      // gives clean handoffs at the act boundaries.
      if (r.top < vh * 0.5 && r.bottom > vh * 0.5) {
        document.documentElement.setAttribute("data-act", String(act));
      }
    };
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [act, global]);

  return (
    <div ref={ref} data-act={act} className={`act-surface ${className}`}>
      {children}
    </div>
  );
}
