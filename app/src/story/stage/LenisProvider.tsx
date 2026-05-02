import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Wraps the app in Lenis-driven smooth scrolling and keeps GSAP
 * ScrollTrigger in sync. Reduced-motion users opt out automatically.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // Once everything has laid out, refresh ScrollTrigger so initial states
    // evaluate correctly against the real document height (Lenis + tall
    // sections can confuse the initial computation).
    const refreshId = window.setTimeout(() => ScrollTrigger.refresh(), 250);

    return () => {
      window.clearTimeout(refreshId);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
}
