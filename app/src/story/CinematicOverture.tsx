import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { GAME_FRAMES, FMT } from "./data";
import { useLang } from "./LangContext";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { StoryBoard } from "./StoryBoard";
import { useStage } from "./stage/StageContext";
import type { StageView } from "./stage/Stage";
import { Board as AnimatedBoard } from "./stage/Board";
import { SearchTreeFX } from "./SearchTreeFX";
import { SelfPlayFX } from "./SelfPlayFX";

/**
 * The cold open. A 12-beat scroll-locked cinematic overture: the actual
 * 12-move Pogo game from data.ts, played out as the reader scrolls.
 * Each beat: a chapter numeral, an editorial headline, a board state,
 * a camera transform, and an edge of monospace tickers that count up as
 * the page does. Reduced-motion mode collapses to a static gallery.
 */

type Beat = {
  numeral: string;
  /** which GAME_FRAMES index to show during this beat */
  frame: number;
  kicker: { en: string; fr: string };
  headline: { en: React.ReactNode; fr: React.ReactNode };
  caption: { en: string; fr: string };
  /** preset camera composition; see camFor() */
  camera: "center" | "left" | "right" | "tight" | "wide" | "tilt";
  /** optional special effect at peak of this beat */
  fx?: "claim" | "fractal" | "fanout" | "verdict" | "softclose" | "tree" | "selfplay";
  /** the running ticker value at this beat (states explored) */
  states: number;
  /** day on the failed minimax run, 0 means N/A */
  day: number;
};

const BEATS: Beat[] = [
  {
    numeral: "I",
    frame: 0,
    kicker: { en: "Before a single line of code", fr: "Avant la première ligne" },
    headline: {
      en: <>An answer was given. <em className="display-italic text-vermilion">It was wrong.</em></>,
      fr: <>Une réponse a été donnée. <em className="display-italic text-vermilion">Elle était fausse.</em></>,
    },
    caption: {
      en: "Pogo. A board game on nine cells. Twelve pieces. One overconfident sentence.",
      fr: "Pogo. Un jeu de plateau sur neuf cases. Douze pièces. Une phrase trop confiante.",
    },
    camera: "wide",
    states: 0,
    day: 0,
  },
  {
    numeral: "II",
    frame: 1,
    kicker: { en: "Five moves to feel the rules", fr: "Cinq coups pour entrer dedans" },
    headline: {
      en: <>White posts a <em className="display-italic">sentinel</em> in the middle.</>,
      fr: <>Blanc pose une <em className="display-italic">sentinelle</em> au centre.</>,
    },
    caption: {
      en: "One piece moves one square. Two pieces, exactly two. Three, one or three. Pieces stack.",
      fr: "Une pièce franchit une case. Deux pièces, exactement deux. Trois, une ou trois. Les pièces s'empilent.",
    },
    camera: "center",
    states: 1,
    day: 0,
  },
  {
    numeral: "III",
    frame: 2,
    kicker: { en: "Nine cells, an old game", fr: "Neuf cases, un jeu ancien" },
    headline: {
      en: <>Red answers, on the <em className="display-italic">same square</em>.</>,
      fr: <>Rouge répond, sur la <em className="display-italic">même case</em>.</>,
    },
    caption: {
      en: "Stacks form. Order matters. The piece on top is the piece in charge.",
      fr: "Les piles se forment. L'ordre compte. La pièce au sommet est la pièce qui décide.",
    },
    camera: "tilt",
    states: 6,
    day: 0,
  },
  {
    numeral: "IV",
    frame: 4,
    kicker: { en: '"No more than a million."', fr: '« Pas plus d\'un million. »' },
    headline: {
      en: <>I said <em className="display-italic text-vermilion">a&nbsp;million</em>. The number was <em className="display-italic text-vermilion">ten</em>.</>,
      fr: <>J'ai dit <em className="display-italic text-vermilion">un&nbsp;million</em>. Le nombre était <em className="display-italic text-vermilion">dix</em>.</>,
    },
    caption: {
      en: "10,481,212 reachable positions. Off by a factor of ten.",
      fr: "10 481 212 positions atteignables. Faux d'un facteur dix.",
    },
    camera: "left",
    fx: "claim",
    states: 1_000_000,
    day: 0,
  },
  {
    numeral: "V",
    frame: 5,
    kicker: { en: "Thirty-six gigabytes at dawn", fr: "Trente-six gigaoctets à l'aube" },
    headline: {
      en: <>Day five. The fans never <em className="display-italic">stopped</em>.</>,
      fr: <>Jour cinq. Les ventilateurs ne se sont <em className="display-italic">jamais arrêtés</em>.</>,
    },
    caption: {
      en: "The transposition table grew like a tide. The search did not finish.",
      fr: "La table de transposition montait comme une marée. La recherche ne se terminait pas.",
    },
    camera: "tight",
    fx: "tree",
    states: 36_000_000,
    day: 5,
  },
  {
    numeral: "VI",
    frame: 7,
    kicker: { en: "The tree had no leaves", fr: "L'arbre n'avait pas de feuilles" },
    headline: {
      en: <>The game does not have to <em className="display-italic text-vermilion">end</em>.</>,
      fr: <>La partie n'est pas obligée de se <em className="display-italic text-vermilion">terminer</em>.</>,
    },
    caption: {
      en: "Two players can shuffle the same three pieces forever. Lazy equilibrium.",
      fr: "Deux joueurs peuvent permuter les mêmes trois pièces sans fin. L'équilibre paresseux.",
    },
    camera: "tilt",
    fx: "fractal",
    states: 49_000_000,
    day: 6,
  },
  {
    numeral: "VII",
    frame: 8,
    kicker: { en: "The rules became the variable", fr: "La règle devient la variable" },
    headline: {
      en: <>If the game won't end, <em className="display-italic">change&nbsp;the&nbsp;game</em>.</>,
      fr: <>Si la partie ne finit pas, on <em className="display-italic">change&nbsp;la&nbsp;partie</em>.</>,
    },
    caption: {
      en: "Five candidate endings. A round-robin. A tournament between rule books.",
      fr: "Cinq fins candidates. Un tournoi. Cinq livres de règles s'affrontent.",
    },
    camera: "right",
    fx: "fanout",
    states: 49_000_000,
    day: 6,
  },
  {
    numeral: "VIII",
    frame: 9,
    kicker: { en: "Self-play, ten thousand games", fr: "Self-play, dix mille parties" },
    headline: {
      en: <>The network learned by losing to <em className="display-italic">itself</em>.</>,
      fr: <>Le réseau a appris en perdant contre <em className="display-italic">lui-même</em>.</>,
    },
    caption: {
      en: "AlphaZero on a 3×3 board. One residual stack. PUCT search. No human games.",
      fr: "AlphaZero sur un plateau 3×3. Un empilement résiduel. Recherche PUCT. Aucune partie humaine.",
    },
    camera: "tilt",
    fx: "selfplay",
    states: 49_000_000,
    day: 6,
  },
  {
    numeral: "IX",
    frame: 10,
    kicker: { en: "The verdict", fr: "Le verdict" },
    headline: {
      en: <><em className="display-italic text-vermilion">100&nbsp;–&nbsp;0</em> against minimax.</>,
      fr: <><em className="display-italic text-vermilion">100&nbsp;–&nbsp;0</em> contre minimax.</>,
    },
    caption: {
      en: "Sudden Death. The variant that survived all three axes — balance, skill, draws.",
      fr: "Mort subite. La variante qui tient les trois critères — équilibre, hiérarchie, nuls.",
    },
    camera: "tight",
    fx: "verdict",
    states: 49_000_000,
    day: 6,
  },
  {
    numeral: "X",
    frame: 11,
    kicker: { en: "Now it is your move", fr: "À vous de jouer" },
    headline: {
      en: <>The opponent in your browser is the <em className="display-italic">same</em> network.</>,
      fr: <>L'adversaire dans votre navigateur est <em className="display-italic">le même</em> réseau.</>,
    },
    caption: {
      en: "ONNX in WebAssembly. The model trained on an iMac runs on your phone, unchanged.",
      fr: "ONNX en WebAssembly. Le modèle entraîné sur un iMac tourne sur votre téléphone, tel quel.",
    },
    camera: "center",
    states: 49_000_000,
    day: 6,
  },
  {
    numeral: "XI",
    frame: 12,
    kicker: { en: "What it learned about winning", fr: "Ce qu'il a appris à gagner" },
    headline: {
      en: <>Tempo. <em className="display-italic">Patience.</em> The middle file.</>,
      fr: <>Le tempo. <em className="display-italic">La patience.</em> La colonne du milieu.</>,
    },
    caption: {
      en: "Lessons no one wrote down. Lessons no one had to write down.",
      fr: "Des leçons que personne n'a écrites. Des leçons que personne n'avait à écrire.",
    },
    camera: "wide",
    states: 49_000_000,
    day: 6,
  },
  {
    numeral: "XII",
    frame: 12,
    kicker: { en: "Keep the problem in your head", fr: "Garder le problème en tête" },
    headline: {
      en: <>Six days to find what could have been <em className="display-italic">five&nbsp;words</em>.</>,
      fr: <>Six jours pour trouver ce qui aurait pu tenir en <em className="display-italic">cinq&nbsp;mots</em>.</>,
    },
    caption: {
      en: "What follows is the postmortem. Read on.",
      fr: "Ce qui suit est l'autopsie. Continuez.",
    },
    camera: "wide",
    fx: "softclose",
    states: 49_000_000,
    day: 6,
  },
];

/* ---------------- scroll progress ---------------- */

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) {
        setP(0);
        return;
      }
      const scrolled = -rect.top;
      setP(Math.max(0, Math.min(1, scrolled / total)));
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
  }, [ref]);
  return p;
}

/* camera presets are now expressed via beatToStageView() further below. */

/* ---------------- big roman numeral ---------------- */

function BigNumeral({ numeral, sub, isFirst }: { numeral: string; sub: number; isFirst: boolean }) {
  const enter = isFirst ? 1 : Math.min(1, sub / 0.3);
  const exit = sub > 0.7 ? 1 - (sub - 0.7) / 0.3 : 1;
  const aliveness = Math.max(0, Math.min(1, enter)) * Math.max(0, Math.min(1, exit));
  // Subtle "breath" — the numeral scales 1 → 1.02 → 1 over the beat.
  const breath = 1 + Math.sin(sub * Math.PI) * 0.02;
  const y = (1 - enter) * 18;
  return (
    <>
      {/* outline ghost — sits behind the filled numeral, slightly larger */}
      <div
        aria-hidden
        className="cinema-numeral display"
        style={{
          opacity: aliveness * 0.18,
          transform: `translate3d(0, ${y}px, 0) scale(${breath * 1.04})`,
          color: "transparent",
          WebkitTextStroke: "1px var(--color-vermilion-deep)",
          mixBlendMode: "normal",
          filter: "blur(1.4px)",
        }}
      >
        {numeral}
      </div>
      {/* main filled vermilion numeral */}
      <div
        aria-hidden
        className="cinema-numeral display"
        style={{
          opacity: aliveness * 0.36,
          transform: `translate3d(0, ${y}px, 0) scale(${breath})`,
        }}
      >
        {numeral}
      </div>
      {/* highlight wash — a brighter copy that pulses at peak sub */}
      <div
        aria-hidden
        className="cinema-numeral display"
        style={{
          opacity: aliveness * Math.max(0, Math.sin(sub * Math.PI)) * 0.15,
          transform: `translate3d(0, ${y}px, 0) scale(${breath * 0.99})`,
          color: "rgba(255,180,140,1)",
          mixBlendMode: "screen",
          filter: "blur(2px)",
        }}
      >
        {numeral}
      </div>
    </>
  );
}

/* ---------------- headline + kicker overlay ---------------- */

function BeatText({
  beat,
  sub,
  lang,
  variant,
  isFirst,
}: {
  beat: Beat;
  sub: number;
  lang: "en" | "fr";
  variant: "left" | "right" | "below";
  isFirst: boolean;
}) {
  // First beat is visible at scroll-zero; all later beats wait for entry.
  const enter = isFirst ? 1 : Math.min(1, sub / 0.22);
  const exit = sub > 0.78 ? 1 - (sub - 0.78) / 0.22 : 1;
  const opacity = Math.max(0, Math.min(1, enter)) * Math.max(0, Math.min(1, exit));
  const y = (1 - enter) * 24;

  const base: CSSProperties = {
    opacity,
    transform: `translate3d(0, ${y}px, 0)`,
    transition: "opacity 220ms ease, transform 220ms ease",
  };

  // Text always lives in the upper third of the viewport, leaving the lower
  // band to the persistent stage (board) and the BigNumeral wash. Kicker /
  // chapter / headline / caption stack at top-[14vh] so the EdgeTickers
  // (header strip) sits cleanly above with breathing room.
  const positionClass =
    variant === "left"
      ? "absolute top-[14vh] left-[5vw] md:left-[8vw] max-w-[44ch]"
      : variant === "right"
      ? "absolute top-[14vh] right-[5vw] md:right-[8vw] max-w-[44ch] text-right"
      : "absolute top-[14vh] left-1/2 -translate-x-1/2 max-w-[60ch] text-center px-6";

  // The kicker / headline / caption each remount on beat-or-language change,
  // and animate in with a clip-path wipe + slide. This gives every beat a
  // proper "curtain rise" instead of plain opacity fades.
  const remountKey = `${beat.numeral}-${lang}`;
  return (
    <div className={`pointer-events-none z-20 ${positionClass}`} style={base}>
      <motion.div
        key={`kicker-${remountKey}`}
        initial={{ opacity: 0, y: -8, clipPath: "inset(0 100% 0 0)" }}
        animate={{ opacity: 1, y: 0, clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="kicker mb-4"
        style={{ letterSpacing: "0.32em" }}
      >
        <span className="text-vermilion">{beat.numeral}</span>
        <span className="text-paper-3 mx-3">·</span>
        <span className="text-paper-3">{beat.kicker[lang]}</span>
      </motion.div>
      <motion.h2
        key={`headline-${remountKey}`}
        initial={{ opacity: 0, y: 22, clipPath: "inset(0 100% 0 0)" }}
        animate={{ opacity: 1, y: 0, clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
        className="display text-[clamp(2.4rem,5.4vw,5.6rem)] leading-[0.98] text-paper"
      >
        {beat.headline[lang]}
      </motion.h2>
      <motion.p
        key={`caption-${remountKey}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.45 }}
        className="mt-6 text-paper-2 text-[clamp(0.95rem,1.15vw,1.15rem)] leading-[1.6] max-w-[42ch] mx-auto md:mx-0"
      >
        {beat.caption[lang]}
      </motion.p>
    </div>
  );
}

/* ---------------- edge tickers ---------------- */

function EdgeTickers({
  beatIdx,
  sub,
  lang,
  total,
}: {
  beatIdx: number;
  sub: number;
  lang: "en" | "fr";
  total: number;
}) {
  const beat = BEATS[beatIdx]!;
  const next = BEATS[Math.min(beatIdx + 1, BEATS.length - 1)]!;
  const states = Math.round(beat.states + (next.states - beat.states) * sub);
  const dayShown = beat.day === 0 ? "—" : `${beat.day}/6`;
  return (
    <>
      {/* Top: opus title bar (sits below the StoryChrome bar) */}
      <div className="absolute top-[68px] md:top-[78px] left-1/2 -translate-x-1/2 z-30 mono text-[10px] tracking-[0.4em] uppercase text-paper-3 flex items-center gap-4">
        <span className="text-vermilion">OPUS Nº 01</span>
        <span className="text-graphite">·</span>
        <span>
          {lang === "en" ? "an overture in twelve" : "une ouverture en douze"}
        </span>
      </div>
      {/* Right side: vertical folio + chapter dots */}
      <div className="absolute top-1/2 -translate-y-1/2 right-3 md:right-6 z-30 flex flex-col items-center gap-3 select-none">
        <span className="mono text-[9px] tracking-[0.4em] uppercase text-paper-3 [writing-mode:vertical-rl]">
          {lang === "en" ? "chapter" : "chapitre"}
        </span>
        <span className="display-italic text-vermilion text-[26px] leading-none">
          {beat.numeral}
        </span>
        <span className="block w-px h-6 bg-graphite" />
        <span className="mono text-[9px] tracking-[0.4em] uppercase text-paper-3">
          {romanOf(total)}
        </span>
        <div className="mt-3 flex flex-col items-center gap-[5px]">
          {BEATS.map((_, i) => (
            <span
              key={i}
              className="block w-[2px] transition-[height,background-color] duration-300"
              style={{
                height: i === beatIdx ? 22 : 8,
                background:
                  i < beatIdx
                    ? "var(--color-vermilion-deep)"
                    : i === beatIdx
                    ? "var(--color-vermilion)"
                    : "var(--color-graphite)",
              }}
            />
          ))}
        </div>
      </div>
      {/* Top-left corner: state + day counters */}
      <div className="absolute top-[22px] md:top-[28px] left-[22px] md:left-[36px] z-30 mono text-[10px] tracking-[0.32em] uppercase text-paper-3 flex gap-8 items-start">
        <div className="flex flex-col gap-1">
          <span>{lang === "en" ? "states" : "états"}</span>
          <span className="text-paper text-[13px] tracking-[0.14em] tabular-nums">
            {states.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span>{lang === "en" ? "day" : "jour"}</span>
          <span className="text-paper text-[13px] tracking-[0.14em] tabular-nums">
            {dayShown}
          </span>
        </div>
      </div>
      {/* Top-right corner: frame ticker */}
      <div className="absolute top-[22px] md:top-[28px] right-[60px] md:right-[80px] z-30 mono text-[10px] tracking-[0.32em] uppercase text-paper-3 flex flex-col gap-1 text-right">
        <span>{lang === "en" ? "frame" : "image"}</span>
        <span className="text-paper text-[13px] tracking-[0.14em] tabular-nums">
          {String(beat.frame).padStart(2, "0")} / 12
        </span>
      </div>
      {/* Center bottom: scroll hint, only visible early on beat I */}
      {beatIdx === 0 && sub < 0.55 && (
        <div
          className="absolute bottom-[18vh] left-1/2 -translate-x-1/2 z-30 mono text-[10px] tracking-[0.45em] uppercase text-paper-3 flex flex-col items-center gap-2"
          style={{ opacity: 1 - sub / 0.55 }}
        >
          <span>{lang === "en" ? "scroll" : "défiler"}</span>
          <span className="h-10 w-px bg-vermilion opacity-90" />
          <span className="text-vermilion text-[9px] tracking-[0.5em]">↓</span>
        </div>
      )}
    </>
  );
}

function romanOf(n: number): string {
  const map: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let s = "";
  let v = n;
  for (const [k, r] of map) {
    while (v >= k) {
      s += r;
      v -= k;
    }
  }
  return s;
}

/* ---------------- special FX overlays ---------------- */

function ClaimFX({ sub }: { sub: number }) {
  // A vermilion strikeout under the wrong number, sitting under the board
  // (which is pushed left by the "left" camera). Compact, supportive.
  const k = Math.min(1, Math.max(0, (sub - 0.15) / 0.5));
  return (
    <div
      aria-hidden
      className="absolute left-[6vw] md:left-[10vw] bottom-[12vh] z-20 mono text-paper-3 text-[10px] tracking-[0.32em] uppercase"
      style={{ opacity: k }}
    >
      <div className="flex flex-col items-start gap-1">
        <span className="text-paper-3">{`said →`}</span>
        <span className="relative inline-block display text-paper-3 text-[clamp(1.6rem,3vw,2.6rem)] tracking-tight leading-none">
          1,000,000
          <span
            className="absolute left-0 right-0 top-1/2 h-[2px] bg-vermilion origin-left"
            style={{ transform: `scaleX(${k})` }}
          />
        </span>
        <span className="text-vermilion mt-3">{`actual →`}</span>
        <span className="display text-vermilion text-[clamp(2rem,4vw,3.4rem)] tracking-tight leading-none">
          10,481,212
        </span>
      </div>
    </div>
  );
}

function FractalFX({ sub }: { sub: number }) {
  // Recursive nested boards — each one positioned at the center cell of the
  // parent (which is b2, the equilibrium cell), scaled down ~40% per level,
  // each slightly rotated. The persistent stage holds the outer board at a
  // deliberately small scale during this beat so the fractal can clearly
  // nest inside it. Layers fade in one by one as the beat progresses.
  const LAYERS = 6;
  const FRAMES = [7, 8, 9, 10, 11, 12];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center"
    >
      {Array.from({ length: LAYERS }).map((_, i) => {
        const layerStart = i * 0.08;
        const k = Math.min(1, Math.max(0, (sub - layerStart) / 0.4));
        if (k <= 0) return null;
        // Outer fractal layer (i=0) starts at ~32% of viewmin (clearly inside
        // the persistent stage's outer board), each subsequent layer is 40%
        // of its parent.
        const scaleVmin = 32 * Math.pow(0.4, i);
        const rot = (i % 2 === 0 ? 1 : -1) * (4 + i * 1.5) * k;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              width: `${scaleVmin}vmin`,
              height: `${scaleVmin}vmin`,
              maxWidth: `${scaleVmin * 7}px`,
              maxHeight: `${scaleVmin * 7}px`,
              transform: `rotate(${rot}deg) scale(${0.85 + 0.15 * k})`,
              opacity: k * Math.max(0.45, 1 - i * 0.1),
              filter: `drop-shadow(0 0 ${24 + i * 10}px rgba(217,79,44,${0.24 + i * 0.06}))`,
              transition: "opacity 220ms ease, transform 320ms ease",
            }}
          >
            <AnimatedBoard
              frameIdx={FRAMES[i] ?? 8}
              mode="standard"
              glow={0.4 + i * 0.1}
              instant
              className="w-full h-full"
            />
          </div>
        );
      })}
      {/* a deep vermilion well at the absolute center */}
      <div
        className="absolute"
        style={{
          width: "5vmin",
          height: "5vmin",
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(255,140,100,0.95), rgba(217,79,44,0.6) 40%, transparent 80%)",
          opacity: Math.min(1, sub * 1.6),
          filter: "blur(6px)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

function FanoutFX({ sub }: { sub: number }) {
  const variants = [GAME_FRAMES[8]!, GAME_FRAMES[9]!, GAME_FRAMES[10]!, GAME_FRAMES[11]!, GAME_FRAMES[12]!];
  const k = Math.min(1, Math.max(0, (sub - 0.1) / 0.6));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      {variants.map((v, i) => {
        const idx = i - (variants.length - 1) / 2;
        const tx = idx * 220 * k;
        const ty = Math.abs(idx) * 26 * k;
        const rot = idx * 4 * k;
        const opacity = (i === 2 ? 0.95 : 0.42) * (0.4 + 0.6 * k);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg) scale(${0.55 + (i === 2 ? 0.05 : 0)})`,
              opacity,
              filter: i === 2 ? "none" : "saturate(0.7)",
              transition: "transform 380ms ease, opacity 380ms ease",
            }}
          >
            <StoryBoard board={v} size="mini" showCoords={false} dim={i !== 2} />
          </div>
        );
      })}
    </div>
  );
}

function VerdictFX({ sub, lang }: { sub: number; lang: "en" | "fr" }) {
  // 100 — 0 stamp that grows
  const k = Math.min(1, Math.max(0, (sub - 0.15) / 0.55));
  const scale = 0.6 + k * 0.6;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
    >
      <div
        className="flex items-baseline gap-6 select-none"
        style={{
          transform: `scale(${scale}) rotate(${(1 - k) * -3}deg)`,
          opacity: k,
          mixBlendMode: "screen",
        }}
      >
        <span className="display text-vermilion text-[clamp(8rem,18vw,18rem)] leading-none tracking-tighter">
          100
        </span>
        <span className="display text-paper-3 text-[clamp(4rem,9vw,9rem)] leading-none">—</span>
        <span className="display-italic text-paper-3 text-[clamp(8rem,18vw,18rem)] leading-none tracking-tighter">
          0
        </span>
      </div>
      <div
        className="absolute bottom-[20vh] left-1/2 -translate-x-1/2 mono text-[10px] tracking-[0.4em] uppercase text-vermilion"
        style={{ opacity: k }}
      >
        {lang === "en" ? "alphazero · self-play · 0 human games" : "alphazero · self-play · 0 partie humaine"}
      </div>
    </div>
  );
}

/** A brief vermilion wash at the peak of dramatic beats — the color "release"
 *  that breaks the otherwise monochrome editorial palette. Triggers around
 *  sub=0.5 of beats with strong FX. */
function ColorBurst({ beat, sub }: { beat: Beat; sub: number }) {
  // map beat → desired peak intensity
  const peakByFx: Record<string, number> = {
    claim: 0.18,
    fanout: 0.16,
    verdict: 0.42,
    fractal: 0.22,
    softclose: 0.14,
    tree: 0.20,
    selfplay: 0.16,
  };
  const peak = peakByFx[beat.fx ?? ""] ?? 0;
  if (peak <= 0) return null;
  // bell curve around sub=0.5 with width 0.35
  const bell = Math.exp(-Math.pow((sub - 0.5) / 0.22, 2));
  const intensity = peak * bell;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[18]"
      style={{
        background: `radial-gradient(ellipse 90% 70% at 50% 50%, rgba(217,79,44,${intensity}) 0%, transparent 70%)`,
        mixBlendMode: "screen",
      }}
    />
  );
}

function SoftcloseFX({ sub, lang }: { sub: number; lang: "en" | "fr" }) {
  const k = Math.min(1, Math.max(0, (sub - 0.4) / 0.55));
  return (
    <div
      aria-hidden
      className="absolute bottom-[14vh] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3"
      style={{ opacity: k }}
    >
      <span className="mono text-[10px] tracking-[0.4em] uppercase text-paper-3">
        {lang === "en" ? "the postmortem begins" : "l'autopsie commence"}
      </span>
      <span className="block h-10 w-px bg-vermilion opacity-90" />
      <span className="mono text-[9px] tracking-[0.5em] uppercase text-vermilion animate-pulse">
        ↓
      </span>
    </div>
  );
}

/* ---------------- beat-to-stage mapping ---------------- */

function beatToStageView(beat: Beat): Partial<StageView> {
  let cam = { x: 0.5, y: 0.5, scale: 0.55, rotate: 0 };
  switch (beat.camera) {
    // y values are intentionally pushed below 0.5 (toward the lower half of
    // the viewport) so the headline (positioned at top ~6-14vh) and the
    // BigNumeral (centered) have clear vertical lanes above the board.
    case "wide":   cam = { x: 0.5,  y: 0.78, scale: 0.42, rotate: 0    }; break;
    case "center": cam = { x: 0.5,  y: 0.72, scale: 0.46, rotate: 0    }; break;
    case "left":   cam = { x: 0.26, y: 0.68, scale: 0.42, rotate: -1.2 }; break;
    case "right":  cam = { x: 0.74, y: 0.68, scale: 0.42, rotate: 0    }; break;
    case "tight":  cam = { x: 0.5,  y: 0.72, scale: 0.55, rotate: 0    }; break;
    case "tilt":   cam = { x: 0.5,  y: 0.72, scale: 0.46, rotate: 1.5  }; break;
  }
  let mode: "standard" | "fanout" | "exploded" = "standard";
  let focusCell: number | null = null;
  if (beat.fx === "fanout")  mode = "fanout";
  if (beat.fx === "fractal") {
    mode = "exploded";
    focusCell = 4;
    cam = { x: 0.5, y: 0.55, scale: 0.95, rotate: 0 };
  }
  if (beat.fx === "tree") {
    // shrink the board to a tiny "root" at the top so the search tree
    // visualization can grow outward from it.
    cam = { x: 0.5, y: 0.12, scale: 0.22, rotate: 0 };
  }
  if (beat.fx === "selfplay") {
    // hide the persistent stage; the SelfPlayFX renders two of its own boards.
    return {
      frameIdx: beat.frame,
      x: 0.5,
      y: 0.5,
      scale: 0.4,
      rotate: 0,
      mode: "standard",
      focusCell: null,
      opacity: 0,
    };
  }
  return {
    frameIdx: beat.frame,
    ...cam,
    mode,
    focusCell,
    opacity: 1,
  };
}

/* ---------------- the overture ---------------- */

export function CinematicOverture() {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const stage = useStage();
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(containerRef);

  const beatCount = BEATS.length;
  const beatProgress = Math.min(beatCount - 0.0001, progress * beatCount);
  const beatIdx = Math.floor(beatProgress);
  const sub = beatProgress - beatIdx;

  const beat = BEATS[beatIdx]!;

  // Drive the persistent stage view as the user scrolls through beats —
  // but only while the overture section is at all in view, so subsequent
  // chapter bindings can take over once we've scrolled past.
  useEffect(() => {
    if (reduced || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const inView = rect.bottom > 0 && rect.top < window.innerHeight;
    if (!inView) return;
    stage.setView({
      ...beatToStageView(beat),
      glow: 0.35 + 0.5 * sub,
    });
  }, [beatIdx, sub, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decide which side text goes on per camera preset
  const textSide: "left" | "right" | "below" =
    beat.camera === "left" ? "right" : beat.camera === "right" ? "left" : "below";

  // Reduced motion → static gallery, no scroll lock
  if (reduced) {
    return (
      <>
      <section className="relative px-6 py-16 max-w-5xl mx-auto">
        <div className="kicker mb-6">
          {lang === "en" ? "Pogofish · Opus Nº 01" : "Pogofish · Opus Nº 01"}
        </div>
        <h1 className="display text-[clamp(2.5rem,6vw,5rem)] leading-[1] mb-12 text-paper">
          {lang === "en"
            ? "An overture in twelve."
            : "Une ouverture en douze."}
        </h1>
        <div className="grid gap-12">
          {BEATS.map((b, i) => (
            <article key={i} className="grid md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start">
              <StoryBoard
                board={GAME_FRAMES[b.frame] ?? GAME_FRAMES[0]!}
                size="default"
                showCoords={false}
              />
              <div>
                <div className="kicker mb-2">
                  <span className="text-vermilion">{b.numeral}</span>
                  <span className="text-paper-3 mx-2">·</span>
                  <span className="text-paper-3">{b.kicker[lang]}</span>
                </div>
                <h2 className="display text-[clamp(1.6rem,3vw,2.6rem)] leading-tight text-paper mb-3">
                  {b.headline[lang]}
                </h2>
                <p className="text-paper-2 max-w-[58ch]">{b.caption[lang]}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div data-overture-end aria-hidden className="h-px w-full" />
      </>
    );
  }

  return (
    <>
    <section
      ref={containerRef}
      className="cinema-section relative"
      style={{ height: `${beatCount * 110}vh` }}
      aria-label={lang === "en" ? "Pogofish overture" : "Ouverture de Pogofish"}
    >
      <div className="cinema-stage sticky top-0 h-screen overflow-hidden">
        {/* atmospheric vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 50%, rgba(217,79,44,0.10), transparent 70%), radial-gradient(80% 60% at 50% 110%, rgba(168,55,25,0.12), transparent 70%)",
          }}
        />
        {/* ambient halo behind board (tracks beat) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
        >
          <div
            className="cinema-halo"
            style={{
              opacity: 0.4 + 0.5 * sub,
              transform: `scale(${0.9 + sub * 0.2})`,
            }}
          />
        </div>

        <BigNumeral numeral={beat.numeral} sub={sub} isFirst={beatIdx === 0} />

        {/* The board itself is rendered by the persistent <Stage>, driven via
            useStage().setView() in an effect above. The overture provides
            text overlays, atmosphere, and edge tickers around it. */}

        {/* text overlay */}
        <BeatText beat={beat} sub={sub} lang={lang} variant={textSide} isFirst={beatIdx === 0} />

        {/* effect layers per beat */}
        {beat.fx === "claim" && <ClaimFX sub={sub} />}
        {beat.fx === "fractal" && <FractalFX sub={sub} />}
        {beat.fx === "fanout" && <FanoutFX sub={sub} />}
        {beat.fx === "verdict" && <VerdictFX sub={sub} lang={lang} />}
        {beat.fx === "softclose" && <SoftcloseFX sub={sub} lang={lang} />}
        {beat.fx === "tree" && <SearchTreeFX sub={sub} />}
        {beat.fx === "selfplay" && <SelfPlayFX sub={sub} />}

        {/* color release: a brief vermilion wash at peak FX moments. */}
        <ColorBurst beat={beat} sub={sub} />

        {/* tickers, always on top */}
        <EdgeTickers beatIdx={beatIdx} sub={sub} lang={lang} total={beatCount} />
      </div>
    </section>
    {/* Sentinel marking the end of the overture for chrome/CTA visibility. */}
    <div data-overture-end aria-hidden className="h-px w-full" />
    </>
  );
}

// re-export for tree-shaking sanity
export { FMT };
