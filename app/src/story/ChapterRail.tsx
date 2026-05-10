import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";
import { STRINGS } from "./i18n";

const CHAPTER_KEYS = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
] as const satisfies (keyof typeof STRINGS.chapters)[];

const CHAPTER_IDS = [
  "chapter-i", "chapter-ii", "chapter-iii", "chapter-iv",
  "chapter-v", "chapter-vi", "chapter-vii", "chapter-viii",
  "chapter-ix", "chapter-x", "chapter-xi", "chapter-xii",
] as const;

function scrollToChapter(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * A vertical chapter rail floating in the right gutter — one dot per chapter
 * (I–XII). Desktop-only: hidden under the lg breakpoint where the mobile stage
 * band provides context instead.
 *
 * Active dot: filled with var(--color-vermilion).
 * Past dots: var(--color-paper-3) with matching border.
 * Inactive dots: transparent with var(--color-graphite) hairline border.
 * Hover: scale 1.4 + tooltip showing chapter kicker to the left.
 */
export function ChapterRail() {
  const { lang } = useLang();
  const [active, setActive] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const sectionsRef = useRef<Element[]>([]);

  useEffect(() => {
    const sections = CHAPTER_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    sectionsRef.current = sections;

    if (sections.length === 0) return;

    // Active = the section whose top is the highest value still <= an anchor
    // line at 35% from the viewport top. Scrolling past a section's top makes
    // it active until the next section's top crosses the line. This works
    // uniformly for short and tall sections, where IntersectionObserver-by-
    // ratio fails (a 2x-viewport-tall section like chapter IX peaks below the
    // 0.5 threshold and the observer never re-fires).
    let frame = 0;
    const compute = () => {
      frame = 0;
      const anchor = window.innerHeight * 0.35;
      let activeIdx = -1;
      for (let i = 0; i < sections.length; i++) {
        const rect = sections[i]!.getBoundingClientRect();
        if (rect.top <= anchor) {
          activeIdx = i;
        } else {
          break;
        }
      }
      setActive((prev) => (prev === activeIdx ? prev : activeIdx >= 0 ? activeIdx : null));
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
    <nav
      aria-label={lang === "en" ? "Chapter navigation" : "Navigation par chapitres"}
      className="hidden lg:flex flex-col gap-3 items-center"
      style={{
        position: "fixed",
        right: "clamp(16px, 2vw, 28px)",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 25,
      }}
    >
      {/* Connecting hairline behind dots */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          transform: "translateX(-50%)",
          background: "var(--color-graphite)",
          opacity: 0.3,
          pointerEvents: "none",
        }}
      />

      {CHAPTER_KEYS.map((key, i) => {
        const isActive = active === i;
        const isPast = active !== null && i < active;
        const isHovered = hovered === i;
        const title = STRINGS.chapters[key][lang];
        const id = CHAPTER_IDS[i]!;

        return (
          <button
            key={key}
            aria-label={`${key} — ${title}`}
            onClick={() => scrollToChapter(id)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="relative flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {/* The dot */}
            <span
              style={{
                display: "block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: `1px solid ${
                  isActive
                    ? "var(--color-vermilion)"
                    : isPast
                    ? "var(--color-paper-3)"
                    : "var(--color-graphite)"
                }`,
                background: isActive
                  ? "var(--color-vermilion)"
                  : isPast
                  ? "var(--color-paper-3)"
                  : "transparent",
                transform: isHovered ? "scale(1.4)" : "scale(1)",
                transition: "background 180ms ease, border-color 180ms ease, transform 150ms ease",
              }}
            />

            {/* Tooltip — shows to the left when hovered */}
            {isHovered && (
              <span
                role="tooltip"
                style={{
                  position: "absolute",
                  right: "calc(100% + 12px)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  background: "var(--color-ink, #1a1714)",
                  color: "var(--color-paper-2, #d4cfc9)",
                  padding: "3px 8px",
                  borderRadius: 3,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  opacity: 0.92,
                  zIndex: 1,
                }}
              >
                {key} &middot; {title}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
