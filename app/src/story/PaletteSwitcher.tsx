import { useEffect, useState } from "react";

type Palette = "default" | "A" | "B" | "C";

const ORDER: Palette[] = ["default", "A", "B", "C"];

const META: Record<Palette, { label: string; hint: string }> = {
  default: { label: "0", hint: "current — ink + vermilion" },
  A: { label: "A", hint: "editorial + cobalt (second voice)" },
  B: { label: "B", hint: "Bauhaus on bone (three primaries)" },
  C: { label: "C", hint: "risograph zine (pink + electric blue)" },
};

function readInitial(): Palette {
  if (typeof window === "undefined") return "default";
  const url = new URL(window.location.href);
  const q = url.searchParams.get("palette");
  if (q && ORDER.includes(q as Palette)) return q as Palette;
  const stored = window.localStorage.getItem("pogofish-palette");
  if (stored && ORDER.includes(stored as Palette)) return stored as Palette;
  return "default";
}

function apply(p: Palette) {
  const html = document.documentElement;
  if (p === "default") {
    html.removeAttribute("data-palette");
  } else {
    html.setAttribute("data-palette", p);
  }
}

/**
 * Tiny floating UI to flip between the three palette candidates and the
 * baseline. Persists the choice in localStorage so the comparison
 * survives refresh while we evaluate. Lives in the bottom-left, above
 * the language toggle.
 */
export function PaletteSwitcher() {
  const [palette, setPalette] = useState<Palette>("default");

  useEffect(() => {
    const initial = readInitial();
    setPalette(initial);
    apply(initial);
  }, []);

  const choose = (p: Palette) => {
    setPalette(p);
    apply(p);
    window.localStorage.setItem("pogofish-palette", p);
  };

  return (
    <div
      className="fixed bottom-5 left-20 z-50 flex items-center gap-2 rounded-full border border-hair bg-ink-2/80 backdrop-blur-md px-2 py-1.5 mono text-[10px] tracking-[0.2em] uppercase text-paper-3"
      title="palette"
    >
      <span className="px-1 hidden sm:inline">palette</span>
      {ORDER.map((p) => {
        const active = p === palette;
        return (
          <button
            key={p}
            onClick={() => choose(p)}
            title={META[p].hint}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 transition-colors ${
              active
                ? "bg-vermilion text-ink"
                : "bg-transparent text-paper-3 hover:text-paper hover:bg-ink-3"
            }`}
          >
            {META[p].label}
          </button>
        );
      })}
    </div>
  );
}
