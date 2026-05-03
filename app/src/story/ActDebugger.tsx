import { useEffect, useState } from "react";

/**
 * Tiny dev-only floating widget that pins a single act's theme onto
 * the <html> root so we can audit each act's surface independently
 * without scrolling. Mount it next to LangToggle. Click an act to
 * "lock" it (pinning data-act and disabling the per-section
 * scroll-driven updates is left to the consumer — we just set the
 * attribute and the consumer's IO will fight us back, which is fine
 * for a dev preview). To clear, click the "·" tile.
 *
 * Toggle visibility with Alt+Shift+A so it doesn't litter prod.
 */
export function ActDebugger() {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyA") {
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!visible) return null;

  const choose = (act: number | null) => {
    setPinned(act);
    if (act === null) {
      document.documentElement.removeAttribute("data-act-pin");
    } else {
      document.documentElement.setAttribute("data-act", String(act));
      document.documentElement.setAttribute("data-act-pin", String(act));
    }
  };

  return (
    <div className="fixed bottom-5 left-20 z-50 flex items-center gap-2 rounded-full border border-hair bg-ink-2/85 backdrop-blur-md px-2 py-1.5 mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
      <span className="px-1 hidden sm:inline">act</span>
      {[null, 1, 2, 3].map((a) => {
        const active = a === pinned;
        const label = a === null ? "·" : String(a);
        return (
          <button
            key={label}
            onClick={() => choose(a)}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 transition-colors ${
              active
                ? "bg-vermilion text-ink"
                : "bg-transparent text-paper-3 hover:text-paper hover:bg-ink-3"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
