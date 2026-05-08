import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLang } from "./LangContext";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * The article's prologue — three frames, three acts, in sequence.
 *
 * Frame 1 (Act 1, cream): "A game found on a shelf."
 * Frame 2 (Act 2, terminal): "Six days, no sleep, with a wrong answer."
 * Frame 3 (Act 3, paper):    "What it learned to win."
 *
 * Each frame inhabits the act's full visual identity. Together they
 * make the contract explicit: the article will *age* as you read it,
 * and these are the three states it passes through.
 *
 * Replaces the previous 12-beat cinematic overture which tried to do
 * everything in one register and ended up disconnected from the body.
 */

type Act = 1 | 2 | 3;

interface Frame {
  act: Act;
  number: string;
  kicker: { en: string; fr: string };
  tagline: { en: string; fr: string };
  caption: { en: string; fr: string };
  /** Numeric stat shown beneath the tagline — purely for cinematic weight. */
  stat: { en: string; fr: string };
}

const FRAMES: Frame[] = [
  {
    act: 1,
    number: "I",
    kicker: { en: "Act I — the experiment", fr: "Acte I — l'expérience" },
    tagline: {
      en: "The experiment was meant to train an AI. It trained the human instead.",
      fr: "L'expérience devait entraîner une IA. C'est l'humain qu'elle a entraîné.",
    },
    caption: {
      en: "A reinforcement-learning experiment on a small board game. Before writing a line of code, the experimenter opened a chat with an AI to plan it. Twelve days of compute later, the only thing that had been trained was him.",
      fr: "Une expérience d'apprentissage par renforcement sur un petit jeu de plateau. Avant d'écrire la moindre ligne de code, l'expérimentateur a ouvert un chat avec une IA pour la planifier. Douze jours de calcul plus tard, la seule chose entraînée, c'était lui.",
    },
    stat: { en: "12 days · 1 sentence", fr: "12 jours · 1 phrase" },
  },
  {
    act: 2,
    number: "II",
    kicker: { en: "Act II — the loss", fr: "Acte II — la perte" },
    tagline: {
      en: "Six days of compute, lost. Twice.",
      fr: "Six jours de calcul, perdus. Deux fois.",
    },
    caption: {
      en: "The solver — written by the AI, in Python — ran for six days, ate thirty-six gigabytes, and was killed by the kernel on the morning of the sixth. The experimenter asked the AI whether the relaunch was safe. The AI said yes. It wasn't.",
      fr: "Le solveur — écrit par l'IA, en Python — a tourné six jours, avalé trente-six gigaoctets, et le noyau l'a tué au matin du sixième. L'expérimentateur a demandé à l'IA si la relance était sûre. L'IA a dit oui. C'était non.",
    },
    stat: { en: "Day 6 · 36 GB · ×2", fr: "Jour 6 · 36 Go · ×2" },
  },
  {
    act: 3,
    number: "III",
    kicker: { en: "Act III — what was left", fr: "Acte III — ce qui restait" },
    tagline: {
      en: "A bug, a rewrite, and a game deeper than the search.",
      fr: "Un bug, une réécriture, et un jeu plus profond que la recherche.",
    },
    caption: {
      en: "Once the real bug — no cycle detection — was found and the rules tightened so the game itself terminates, the solver finished in fifty-four minutes. It still didn't solve Pogo: the game is deeper than twenty plies. The network loaded into this page learned to play what's left.",
      fr: "Une fois le vrai bug — l'absence de détection de cycles — repéré et les règles resserrées pour que le jeu lui-même se termine, le solveur a tourné en cinquante-quatre minutes. Il n'a pas pour autant résolu Pogo : le jeu est plus profond que vingt coups. Le réseau chargé dans cette page a appris à jouer ce qui reste.",
    },
    stat: { en: "975K positions · 54 min", fr: "975 000 positions · 54 min" },
  },
];

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let frame = 0;
    const evaluate = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) {
        setP(0);
        return;
      }
      const traveled = -rect.top;
      const ratio = Math.max(0, Math.min(1, traveled / total));
      setP(ratio);
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
  return p;
}

export function Prologue() {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref);

  // Three frames over 300vh of scroll. Map progress (0..1) to a fractional
  // frame position so we can crossfade between adjacent frames at the
  // boundaries.
  const frameCount = FRAMES.length;
  const framePos = Math.min(frameCount - 0.0001, progress * frameCount);
  const idx = Math.floor(framePos);
  const sub = framePos - idx;
  const frame = FRAMES[idx]!;

  // Reduced-motion fallback — three stacked sections, no sticky scroll.
  if (reduced) {
    return (
      <>
        <div className="kicker text-center pt-12 pb-4">
          <span className="text-vermilion">Pogofish</span>
          <span className="text-paper-3 mx-2">·</span>
          <span className="text-paper-3">
            {lang === "en" ? "An overture in three acts" : "Une ouverture en trois actes"}
          </span>
        </div>
        {FRAMES.map((f) => (
          <section
            key={f.number}
            data-act={f.act}
            className="act-surface relative px-6 py-24 md:py-36 border-t border-hair"
          >
            <div className="mx-auto max-w-4xl text-center">
              <div className="kicker mb-6">
                <span className="text-vermilion">{f.kicker[lang]}</span>
                <span className="text-paper-3 mx-2">·</span>
                <span className="text-paper-3">{f.number}</span>
              </div>
              <h2 className="display text-[clamp(2.5rem,6vw,5.5rem)] leading-[1.05] mb-8">
                {f.tagline[lang]}
              </h2>
              <p className="body text-paper-2 max-w-2xl mx-auto">{f.caption[lang]}</p>
              <p className="display-italic text-vermilion text-3xl mt-10">{f.stat[lang]}</p>
            </div>
          </section>
        ))}
        <div data-overture-end aria-hidden className="h-px w-full" />
      </>
    );
  }

  // Each frame's content opacity peaks at sub=0.5 within its slot; we
  // crossfade out at the boundary so the next frame's act surface
  // (different background, different texture) takes over cleanly. The
  // very first frame is visible at scroll-zero so the cold open lands
  // immediately (no waiting for the user to scroll a pixel before the
  // article exists on screen).
  const isFirstFrame = idx === 0;
  const enter = isFirstFrame ? 1 : Math.min(1, sub / 0.18);
  const exit = sub > 0.82 ? 1 - (sub - 0.82) / 0.18 : 1;
  const contentOpacity = Math.max(0, Math.min(1, enter)) * Math.max(0, Math.min(1, exit));

  // The kicker sits high; the tagline is the centrepiece; the caption
  // grounds it; the stat anchors the bottom. Each gets its own
  // entrance offset so they wipe in sequence within a single frame.
  const liftA = (1 - enter) * 28;
  const liftB = (1 - enter) * 36;
  const liftC = (1 - enter) * 44;

  return (
    <>
      <section
        ref={ref}
        className="prologue relative"
        // The sticky child pins for (height - 100vh) of scroll. We want
        // each frame to dwell for ~1 viewport, so height = (N + 1) * 100vh.
        style={{ height: `${(frameCount + 1) * 100}vh` }}
        aria-label={
          lang === "en"
            ? "Pogofish prologue: three acts"
            : "Prologue de Pogofish : trois actes"
        }
      >
        <div
          data-act={frame.act}
          className="act-surface w-full overflow-hidden transition-colors duration-700"
          style={{
            // Force sticky over the .act-surface { position: relative } base.
            position: "sticky",
            top: 0,
            height: "100vh",
            zIndex: 2,
          }}
        >
          {/* tiny brand strip */}
          <div className="pointer-events-none absolute top-6 left-6 md:top-8 md:left-10 mono text-[10px] tracking-[0.32em] uppercase text-paper-3">
            <span className="text-vermilion">Pogofish</span>
            <span className="mx-2">·</span>
            <span>
              {lang === "en"
                ? "An overture in three acts"
                : "Une ouverture en trois actes"}
            </span>
          </div>

          {/* act/frame counter top-right */}
          <div className="pointer-events-none absolute top-6 right-6 md:top-8 md:right-10 flex flex-col items-end gap-2 mono text-[10px] tracking-[0.32em] uppercase text-paper-3">
            <span>
              {lang === "en" ? "Act" : "Acte"}{" "}
              <span className="text-vermilion">{frame.number}</span>
              <span className="text-paper-3"> / III</span>
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`frame-${idx}-${lang}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: contentOpacity }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
            >
              {/* kicker */}
              <div
                className="kicker mb-6"
                style={{
                  transform: `translate3d(0, ${liftA}px, 0)`,
                  opacity: enter,
                }}
              >
                <span className="text-vermilion">{frame.kicker[lang]}</span>
                <span className="text-paper-3 mx-2">·</span>
                <span className="text-paper-3">{frame.number}</span>
              </div>

              {/* tagline — the dramatic line */}
              <h2
                className="display max-w-[18ch] leading-[1.02]"
                style={{
                  fontSize: "clamp(2.6rem, 7.4vw, 7rem)",
                  transform: `translate3d(0, ${liftB}px, 0)`,
                  opacity: enter,
                }}
              >
                {frame.tagline[lang]}
              </h2>

              {/* caption — grounds the line */}
              <p
                className="body text-paper-2 mt-8 max-w-[44ch]"
                style={{
                  transform: `translate3d(0, ${liftC}px, 0)`,
                  opacity: enter * 0.85,
                }}
              >
                {frame.caption[lang]}
              </p>

              {/* stat — bottom anchor in display-italic vermilion */}
              <div
                className="display-italic text-vermilion mt-10"
                style={{
                  fontSize: "clamp(2rem, 4vw, 3.4rem)",
                  transform: `translate3d(0, ${liftC * 1.15}px, 0)`,
                  opacity: enter,
                }}
              >
                {frame.stat[lang]}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* defile hint, only on the first frame */}
          {idx === 0 && sub < 0.5 && (
            <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <span className="block h-10 w-px bg-vermilion opacity-80" />
              <span className="mono text-[9px] tracking-[0.5em] uppercase text-vermilion animate-pulse">
                ↓
              </span>
            </div>
          )}

          {/* progress dots (3 frames) */}
          <div className="pointer-events-none absolute bottom-8 right-6 md:right-10 flex items-center gap-2">
            {FRAMES.map((_, i) => (
              <span
                key={i}
                className="block rounded-full transition-all duration-500"
                style={{
                  width: i === idx ? 22 : 6,
                  height: 2,
                  background:
                    i < idx
                      ? "var(--color-vermilion-deep)"
                      : i === idx
                      ? "var(--color-vermilion)"
                      : "var(--color-graphite)",
                }}
              />
            ))}
          </div>
        </div>
      </section>
      <div data-overture-end aria-hidden className="h-px w-full" />
    </>
  );
}
