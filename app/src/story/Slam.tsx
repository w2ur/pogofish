import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "./LangContext";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * The wrong-answer slam — the iconic moment of the article.
 *
 * Renders a tall placeholder section that drives ~260vh of scroll. While
 * the section is the active in-viewport element, a position:fixed
 * overlay paints the slam full-bleed across the viewport (escaping the
 * narrative grid column) and runs a six-beat scroll-driven sequence:
 *
 *   Beat 1 (p ≤ 0.16) — "1,000,000" alone, centered, on the cream paper.
 *                       Caption: "less than that, I said."
 *   Beat 2 (0.18..0.34) — a vermilion "× 50" stamp slams in from above
 *                         with rotation; lands with a spring on the number.
 *   Beat 3 (0.36..0.54) — strikethrough draws left-to-right across the
 *                         wrong number.
 *   Beat 4 (0.55..0.78) — "49,000,000+" writes itself in below in larger
 *                         type.
 *   Beat 5 (0.78..0.94) — RGB-shift glitch + scanline tear.
 *   Beat 6 (0.94..1.00) — page resolves to terminal black. Act II begins.
 *
 * Reduced-motion fallback: a static side-by-side compare with a hairline
 * underneath the wrong number, no glitch, no animation. Safe and legible.
 */

interface SlamCopy {
  caption: { en: string; fr: string };
  claimedLabel: { en: string; fr: string };
  actualLabel: { en: string; fr: string };
  closer: { en: string; fr: string };
}

const COPY: SlamCopy = {
  caption: {
    en: "the estimate.",
    fr: "l'estimation.",
  },
  claimedLabel: { en: "estimated", fr: "estimé" },
  actualLabel: { en: "first run", fr: "premier run" },
  closer: {
    en: "off by a factor of fifty.",
    fr: "à un facteur cinquante près.",
  },
};

interface SlamState {
  /** Scroll progress through the section, 0..1. */
  p: number;
  /** Visibility of the fixed overlay, 0..1 — fades in/out at section edges. */
  visible: number;
}

function useSlamState(ref: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<SlamState>({ p: 0, visible: 0 });
  useEffect(() => {
    let frame = 0;
    const evaluate = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      let p = 0;
      if (total > 0) {
        const traveled = -rect.top;
        p = Math.max(0, Math.min(1, traveled / total));
      }
      // Visibility: 1 while the section spans the viewport ("pinned"),
      // fading at the entry (last 80px before pin) and exit (last 80px
      // before the section is fully above the viewport). Anything outside
      // those windows resolves to 0 so we never paint over later content.
      const fade = 80;
      let visible = 0;
      if (rect.top > 0) {
        // Entering — top is moving from +window down to 0.
        visible = Math.max(0, 1 - rect.top / fade);
      } else if (rect.bottom > window.innerHeight) {
        // Pinned — top above viewport, bottom below it. Full opacity.
        visible = 1;
      } else if (rect.bottom > 0) {
        // Exiting — bottom is moving from window down to 0.
        visible = Math.min(1, rect.bottom / fade);
      } else {
        // Section is fully above the viewport.
        visible = 0;
      }
      setState({ p, visible });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(evaluate);
    };
    evaluate();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);
  return state;
}

/** Linear remap of `p` from [a,b] into [0,1], clamped. */
function band(p: number, a: number, b: number) {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

/** Spring-like easing for the stamp arrival. Slight overshoot via damped cosine. */
function overshoot(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-6 * t) * Math.cos(8 * t);
}

export function WrongAnswerSlam() {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { p, visible } = useSlamState(ref);

  if (reduced) {
    return (
      <div
        className="my-10 grid grid-cols-2 gap-8 border-t border-b border-hair py-8"
        aria-label={
          lang === "en" ? "Claimed versus actual" : "Annoncé contre réel"
        }
      >
        <div>
          <div className="kicker mb-2" style={{ color: "var(--color-paper-3)" }}>
            {COPY.claimedLabel[lang]}
          </div>
          <div className="display text-[clamp(2rem,4vw,3rem)] text-paper-3 line-through decoration-vermilion decoration-[3px]">
            1,000,000
          </div>
        </div>
        <div>
          <div className="kicker mb-2">{COPY.actualLabel[lang]}</div>
          <div className="display text-[clamp(2rem,4vw,3rem)] text-vermilion">
            49,000,000+
          </div>
        </div>
      </div>
    );
  }

  // ---- beats ----------------------------------------------------------
  const beat1 = band(p, 0.0, 0.16);
  const stampT = overshoot(band(p, 0.18, 0.34));
  const strikeT = band(p, 0.36, 0.54);
  const truthT = band(p, 0.55, 0.78);
  const glitchT = band(p, 0.78, 0.94);
  const blackT = band(p, 0.94, 1.0);

  const stampY = (1 - stampT) * -260;
  const stampRot = (1 - stampT) * -22 + stampT * -8;
  const stampScale = 0.7 + stampT * 0.5;
  const stampOpacity = stampT;

  const numberShake =
    stampT > 0.4 && stampT < 0.7 ? Math.sin(stampT * 60) * 2 : 0;

  const glitchPhase = glitchT > 0 && glitchT < 1 ? glitchT : 0;
  const jitter = (seed: number) =>
    glitchPhase > 0
      ? (Math.sin(seed + p * 80) + Math.cos(seed * 1.3 + p * 90)) *
        4 *
        glitchPhase
      : 0;
  const rOff = jitter(1.1);
  const bOff = jitter(2.7);
  const yShake = jitter(3.3) * 0.4;

  // Overlay portaled to <body> so it escapes the grid's stacking context
  // and the persistent stage's compositor layer (the board uses
  // will-change:transform which can paint above z-indexed content in the
  // grid). This is the only reliable way to land it on top.
  const overlay = (
    <div
      aria-hidden={visible < 0.5}
      className="overflow-hidden"
      style={{
        position: "fixed",
        inset: 0,
        opacity: visible,
        pointerEvents: visible > 0.5 ? "auto" : "none",
        background: "var(--color-ink)",
        // Below header (z-40) and play CTA (z-50) so they remain reachable
        // and the slam doesn't trap the user.
        zIndex: 35,
      }}
    >
        {/* Terminal-black overlay grows during the final beat. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "#0a0a0a",
            opacity: blackT,
            transition: "opacity 80ms linear",
            zIndex: 5,
          }}
        />

        {/* Scanline tear during glitchT */}
        {glitchPhase > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0"
            style={{
              top: `${30 + Math.sin(p * 50) * 20}%`,
              height: 6,
              background:
                "linear-gradient(to bottom, transparent, var(--color-vermilion) 50%, transparent)",
              opacity: glitchPhase * 0.8,
              transform: `translate3d(${jitter(5.5)}px, 0, 0)`,
              mixBlendMode: "multiply",
              zIndex: 4,
            }}
          />
        )}

        {/* Numeric stage */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-6"
          style={{
            transform: `translate3d(0, ${yShake}px, 0)`,
          }}
        >
          {/* claim label */}
          <div
            className="kicker mb-4"
            style={{
              color: "var(--color-paper-3)",
              opacity: beat1 * (1 - blackT),
              transform: `translate3d(0, ${(1 - beat1) * 12}px, 0)`,
            }}
          >
            {COPY.claimedLabel[lang]}
          </div>

          {/* The wrong number — viewport-filling, with strikethrough drawn over */}
          <div
            className="relative"
            style={{
              transform: `translate3d(0, ${numberShake}px, 0)`,
              opacity: 1 - blackT,
            }}
          >
            {/* RGB ghost — red */}
            <div
              aria-hidden
              className="absolute inset-0 display select-none"
              style={{
                color: "var(--color-vermilion)",
                fontSize: "clamp(4rem, 14vw, 12rem)",
                lineHeight: 0.95,
                transform: `translate3d(${rOff - 2}px, 0, 0)`,
                opacity: glitchPhase > 0 ? 0.7 : 0,
                mixBlendMode: "screen",
                pointerEvents: "none",
                letterSpacing: "-0.02em",
              }}
            >
              1,000,000
            </div>
            {/* RGB ghost — cyan */}
            <div
              aria-hidden
              className="absolute inset-0 display select-none"
              style={{
                color: "#3aa8c0",
                fontSize: "clamp(4rem, 14vw, 12rem)",
                lineHeight: 0.95,
                transform: `translate3d(${bOff + 2}px, 0, 0)`,
                opacity: glitchPhase > 0 ? 0.6 : 0,
                mixBlendMode: "screen",
                pointerEvents: "none",
                letterSpacing: "-0.02em",
              }}
            >
              1,000,000
            </div>
            {/* The number itself */}
            <div
              className="display relative"
              style={{
                fontSize: "clamp(4rem, 14vw, 12rem)",
                lineHeight: 0.95,
                color: "var(--color-paper)",
                opacity: beat1,
                letterSpacing: "-0.02em",
              }}
            >
              1,000,000
              {/* strikethrough drawn left to right */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-1/2 h-[6px] md:h-[10px] -translate-y-1/2 origin-left"
                style={{
                  width: "100%",
                  background: "var(--color-vermilion)",
                  transform: `scaleX(${strikeT})`,
                  boxShadow:
                    strikeT > 0
                      ? "0 0 18px color-mix(in oklab, var(--color-vermilion) 60%, transparent)"
                      : "none",
                }}
              />
            </div>
          </div>

          {/* "× 50" stamp — slams from above onto the upper-right of the
              number with a real-ink-stamp aesthetic. Lands off-center so it
              looks struck rather than placed. */}
          <div
            aria-hidden
            className="absolute pointer-events-none select-none"
            style={{
              top: "50%",
              left: "50%",
              transform: `translate3d(calc(-50% + 14vw), calc(-50% - 14vh + ${stampY}px), 0) rotate(${stampRot}deg) scale(${stampScale})`,
              opacity: stampOpacity * 0.92 * (1 - blackT),
              fontFamily: "var(--font-display, serif)",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: "clamp(2.4rem, 4.6vw, 4.2rem)",
              color: "var(--color-vermilion)",
              padding: "0.18em 0.55em",
              border: "4px solid var(--color-vermilion)",
              borderRadius: 4,
              letterSpacing: "0.06em",
              textShadow:
                "0 0 14px color-mix(in oklab, var(--color-vermilion) 40%, transparent)",
              boxShadow:
                "inset 0 0 12px color-mix(in oklab, var(--color-vermilion) 18%, transparent)",
              whiteSpace: "nowrap",
            }}
          >
            × 50
          </div>

          {/* caption */}
          <p
            className="display-italic mt-8 text-center"
            style={{
              color: "var(--color-paper-2)",
              fontSize: "clamp(1.1rem, 1.6vw, 1.5rem)",
              opacity: beat1 * (1 - truthT * 0.4) * (1 - blackT),
              transform: `translate3d(0, ${(1 - beat1) * 12}px, 0)`,
            }}
          >
            {COPY.caption[lang]}
          </p>

          {/* truth — writes in below */}
          <div
            className="mt-10 flex flex-col items-center"
            style={{
              opacity: truthT * (1 - blackT),
              transform: `translate3d(0, ${(1 - truthT) * 28}px, 0)`,
            }}
          >
            <div
              className="kicker mb-2"
              style={{ color: "var(--color-vermilion)" }}
            >
              {COPY.actualLabel[lang]}
            </div>
            <div
              className="display relative overflow-hidden"
              style={{
                color: "var(--color-vermilion)",
                fontSize: "clamp(5rem, 16vw, 14rem)",
                lineHeight: 0.95,
                letterSpacing: "-0.02em",
                textShadow:
                  "0 0 36px color-mix(in oklab, var(--color-vermilion) 45%, transparent)",
                clipPath: `inset(0 ${(1 - truthT) * 100}% 0 0)`,
              }}
            >
              49,000,000+
            </div>
            <p
              className="display-italic mt-3"
              style={{
                color: "var(--color-paper-2)",
                fontSize: "clamp(1rem, 1.4vw, 1.3rem)",
                opacity: Math.max(0, truthT - 0.4),
              }}
            >
              {COPY.closer[lang]}
            </p>
          </div>
        </div>

        {/* progress hairline at the bottom */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 w-32 h-px"
          style={{ background: "var(--color-graphite)", opacity: 0.4 }}
        >
          <div
            style={{
              width: `${p * 100}%`,
              height: "100%",
              background: "var(--color-vermilion)",
            }}
          />
        </div>
    </div>
  );

  return (
    <section
      ref={ref}
      aria-label={
        lang === "en"
          ? "The wrong answer — by a factor of fifty"
          : "La mauvaise réponse — à un facteur cinquante"
      }
      style={{ height: "260vh" }}
      className="relative"
    >
      {typeof document !== "undefined"
        ? createPortal(overlay, document.body)
        : null}
    </section>
  );
}
