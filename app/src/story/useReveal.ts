import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }

    // Initial geometric check: if the element is already in (or near) the
    // viewport at mount time, reveal it immediately. Without this, async-
    // loaded sections (LearningsScene etc.) sit invisible after a fast scroll
    // because the observer's first callback never fires for already-static
    // intersections under Lenis-driven smooth scroll.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.bottom > 0 && rect.top < vh) {
      el.classList.add("is-visible");
      return;
    }

    let frame = 0;
    const check = () => {
      frame = 0;
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Reveal once any part of the element enters the bottom 90% of the
      // viewport — matches the rootMargin "-10% 0px" semantics.
      if (r.top < vh * 0.9 && r.bottom > 0) {
        el.classList.add("is-visible");
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Run once on next paint in case we mounted with the element already
    // in view (post-async load, post-fast-scroll, post-Lenis-jump).
    frame = requestAnimationFrame(check);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reducedMotion]);

  return ref;
}

/** Reports an index when it enters the centered zone — used for pinned-board scene activation. */
export function useActiveIndex(count: number) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const currentRefs = refs.current.slice(0, count);
    currentRefs.forEach((el, index) => {
      if (!el) return;
      const o = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(index);
          }
        },
        { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
      );
      o.observe(el);
      observers.push(o);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [count]);

  return { refs, active };
}
