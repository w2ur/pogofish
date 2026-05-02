import { useEffect, useState } from "react";

/**
 * A thin vermilion bar pinned to the very top of the viewport that fills
 * left-to-right as the reader scrolls through the article. Iconic peak-
 * journalism touch — the kind of element NYT/Pudding pieces use to give
 * the reader a sense of progress through long-form.
 */
export function ScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) {
        setP(0);
        return;
      }
      setP(Math.max(0, Math.min(1, window.scrollY / total)));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
      style={{ height: 2 }}
    >
      <div
        className="h-full origin-left"
        style={{
          width: "100%",
          transform: `scaleX(${p})`,
          background:
            "linear-gradient(90deg, rgba(217,79,44,0) 0%, var(--color-vermilion) 30%, var(--color-vermilion) 70%, rgba(217,79,44,0) 100%)",
          transition: "transform 90ms linear",
          willChange: "transform",
        }}
      />
    </div>
  );
}
