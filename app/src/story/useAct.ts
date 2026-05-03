import { useEffect, useState } from "react";

export type Act = 1 | 2 | 3;

function readAct(el: HTMLElement | null): Act {
  let cur: HTMLElement | null = el;
  while (cur) {
    const a = cur.getAttribute("data-act");
    if (a === "1" || a === "2" || a === "3") return Number(a) as Act;
    cur = cur.parentElement;
  }
  // fallback: <html data-act>, set globally by <Act global> wrappers
  if (typeof document !== "undefined") {
    const a = document.documentElement.getAttribute("data-act");
    if (a === "1" || a === "2" || a === "3") return Number(a) as Act;
  }
  return 1;
}

/**
 * Resolves the current act by walking up from `ref` until a `data-act`
 * attribute is found, falling back to `<html data-act>`. Re-evaluates on
 * any documentElement attribute mutation, on scroll, and on resize so
 * scroll-driven act handoffs are picked up live.
 *
 * Used by Board so it can metamorphose its rendering style across acts
 * (sketch / ASCII-debug / published-figure) without each consumer
 * having to plumb an `act` prop through.
 */
export function useAct(ref: React.RefObject<HTMLElement | null>): Act {
  const [act, setAct] = useState<Act>(1);
  useEffect(() => {
    const evaluate = () => {
      setAct(readAct(ref.current));
    };
    evaluate();
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        evaluate();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const obs = new MutationObserver(evaluate);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-act"],
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      obs.disconnect();
    };
  }, [ref]);
  return act;
}
