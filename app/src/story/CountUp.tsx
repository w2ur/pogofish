import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from 0 to `to` when scrolled into view.
 * Inline-block so it doesn't break flow.
 */
export function CountUp({
  to,
  suffix = "",
  prefix = "",
  duration = 1400,
  formatter,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  formatter?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !fired.current) {
            fired.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              const eased = 1 - Math.pow(1 - t, 3);
              setVal(to * eased);
              if (t < 1) requestAnimationFrame(tick);
              else setVal(to);
            };
            requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);

  const display = formatter
    ? formatter(val)
    : Math.round(val).toLocaleString();
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
