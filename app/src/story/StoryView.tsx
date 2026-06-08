import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { fadeUp, fadeIn, fadeRight } from "./motion";
import { StoryBoard } from "./StoryBoard";
import { Term } from "./Term";
import { TryYourself } from "./TryYourself";
import { PlayCTA } from "./PlayCTA";
import { Callout } from "./Callout";
import { EnFr } from "./EnFr";
import { LangToggle } from "./LangToggle";
import { Act } from "./Act";
import { ActDebugger } from "./ActDebugger";
import { Prologue } from "./Prologue";
import { WrongAnswerSlam } from "./Slam";
import { Marginalia } from "./Marginalia";
import { GuessReachable } from "./GuessReachable";
import { GuessProvider } from "./GuessContext";
import { useAct } from "./useAct";

import { ScrollProgress } from "./ScrollProgress";
import { ChapterRail } from "./ChapterRail";
import { CountUp } from "./CountUp";
import { useLang } from "./LangContext";
import { STRINGS, tf } from "./i18n";
import { useReveal, useActiveIndex } from "./useReveal";
import { StageProvider, useStage, StageBinder } from "./stage/StageContext";
import { Stage } from "./stage/Stage";
import { Board as FinaleSvgBoard } from "./stage/Board";
import {
  VARIANTS,
  FAILED_RUN_DAYS,
  VERDICT,
  FMT,
} from "./data";

const PlayScene = lazy(() =>
  import("./PlayScene").then((m) => ({ default: m.PlayScene }))
);
const LearningsScene = lazy(() =>
  import("./LearningsScene").then((m) => ({ default: m.LearningsScene }))
);
const GlossaryConstellation = lazy(() =>
  import("./GlossaryConstellation").then((m) => ({
    default: m.GlossaryConstellation,
  }))
);

/** Chapter numerals stay language-agnostic — kickers come from i18n. */
type ChapterKey = keyof typeof STRINGS.chapters;
const CHAPTER_NUMERAL: Record<ChapterKey, string> = {
  I: "I", II: "II", III: "III", IV: "IV", V: "V", VI: "VI",
  VII: "VII", VIII: "VIII", IX: "IX", X: "X", XI: "XI", XII: "XII",
};
/** Numerals shown in the PinnedStory aside, indexed by panel 0..4
 *  (which maps to chapters III..VII). */
const CHAPTER_NUMERAL_PIN = ["III", "IV", "V", "VI", "VII"];

export function StoryView() {
  const { lang } = useLang();
  usePageTitle();
  return (
    <StageProvider>
      <GuessProvider>
      <div className="story story-grain story-noise min-h-screen">
        <SkipLink />
        <ActAnnouncer />
        <ScrollProgress className="lg:hidden" />
        <ChapterRail />
        <PersistentStage />
        <StoryChrome />

        <main id="content">
        <article>
        {/* Single document heading for SEO + screen readers. The visible
            "title" is the cinematic three-frame prologue (styled h2
            taglines), so the page's one <h1> is sr-only — it carries full
            crawler/a11y weight with no change to the composition. */}
        <h1 className="sr-only">{STRINGS.pageTitle[lang]}</h1>

        {/* Prologue — three-act triptych. Each frame inhabits one act's
            full visual identity, making the contract explicit: the article
            ages as you read it. The persistent stage stays hidden during
            the prologue so each frame is its own self-contained image. */}
        <StageBinder view={null}><Prologue /></StageBinder>

        {/* ------------------------------------------------------------
            ACT I — THE GAME (chapters I–IV)
            Wood + cream paper + cocoa ink + pencil red.
            William finds Pogo. Hand-touched, physical, warm.

            PinnedStory manages its own data-act because the act 1 → 2
            transition happens *inside* it (panel 1 → panel 2 = chapter
            IV → V = "the night William opens his laptop"). It is the
            narrative pivot point.
            ------------------------------------------------------------ */}
        <Act act={1} global>
          <StageBinder view={null}><TryYourself /></StageBinder>
        </Act>
        <PinnedStory />

        {/* ------------------------------------------------------------
            ACT II — THE WORK (chapters V–IX)
            Terminal black + off-white mono + phosphor green / rust.
            The six-day run. Cold, technical, monospace dominant.
            ------------------------------------------------------------ */}
        <Act act={2} global>
          <StageBinder view={null}><Scene7Experiments /></StageBinder>
          <StageBinder view={null}><Scene8Verdict /></StageBinder>
          <StageBinder view={null}><RecoveryBeat /></StageBinder>
        </Act>

        {/* ------------------------------------------------------------
            ACT III — THE SYNTHESIS (chapters X–XII)
            Matte off-white + navy ink + warm gold accent.
            The polished writeup. Designed, calm, finished.
            ------------------------------------------------------------ */}
        <Suspense fallback={<ActLoadingFallback />}>
          <Act act={3} global>
            {/* Glossary (reference material) sits BEFORE the epilogue so the
                article's reframe + dated sign-off land genuinely last — no
                appendix scrolling past the close. */}
            <StageBinder view={null}><PlayScene /></StageBinder>
            <StageBinder view={null}><LearningsScene /></StageBinder>
            <StageBinder view={null}><GlossaryConstellation /></StageBinder>
            <StageBinder view={null}><Scene10Epilogue /></StageBinder>
          </Act>
        </Suspense>
        </article>
        </main>

        {/* The footer is past the last chapter — bind a null view so the
            persistent stage hides and the mobile band fades out. Without this
            the last Act 3 view (GlossaryConstellation) hangs over the footer
            like a stale board. */}
        <StageBinder view={null}><StoryFooter /></StageBinder>
        <PlayCTA />
        <LangToggle />
        <ActDebugger />
      </div>
      </GuessProvider>
    </StageProvider>
  );
}

/** Placeholder shown while Act III lazy chunks are fetching.
 *  Sized at ~60vh so the scrollbar doesn't jump noticeably. */
function ActLoadingFallback() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "flex-end",
        paddingBottom: "4rem",
        color: "var(--color-ink)",
        opacity: 0.3,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "0.65rem",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          backgroundColor: "var(--color-paper-3, transparent)",
          padding: "0.25rem 0.5rem",
        }}
      >
        Act III loading
      </span>
    </div>
  );
}

/** Reads the stage view from context and renders the persistent board. */
function PersistentStage() {
  const { view } = useStage();
  return <Stage view={view} z="back" />;
}

function usePageTitle() {
  const { lang } = useLang();
  useEffect(() => {
    document.title = STRINGS.pageTitle[lang];
  }, [lang]);
}

/* ---------------- a11y helpers ---------------- */

function SkipLink() {
  const { lang } = useLang();
  return (
    <a
      href="#chapter-iii"
      className="sr-only focus:not-sr-only fixed top-2 left-2 z-[200] bg-paper text-ink px-3 py-2 rounded font-mono text-xs uppercase tracking-wider"
    >
      {lang === "en" ? "Skip to story" : "Aller au récit"}
    </a>
  );
}

function ActAnnouncer() {
  const { lang } = useLang();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const labels: Record<string, { en: string; fr: string }> = {
      "1": { en: "Act I — the game", fr: "Acte I — le jeu" },
      "2": { en: "Act II — the work", fr: "Acte II — le travail" },
      "3": { en: "Act III — the synthesis", fr: "Acte III — la synthèse" },
    };
    const read = () => {
      const a = document.documentElement.getAttribute("data-act");
      if (a && labels[a]) setAnnouncement(labels[a][lang]);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-act"],
    });
    return () => obs.disconnect();
  }, [lang]);

  return (
    <output className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </output>
  );
}

/* ---------------- chrome ---------------- */

function StoryChrome() {
  const { lang } = useLang();
  // Hide chrome while the cinematic overture is on-screen — the overture
  // carries its own opus title bar. Reveal once the reader has scrolled past.
  const [pastOverture, setPastOverture] = useState(false);
  useEffect(() => {
    const sentinel = document.querySelector("[data-overture-end]");
    if (!sentinel) return;
    const update = () => {
      const top = sentinel.getBoundingClientRect().top;
      setPastOverture(top <= 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 md:px-10 md:py-5 pointer-events-none transition-opacity duration-500"
      style={{
        background:
          "linear-gradient(180deg, rgba(18,16,14,0.92) 0%, rgba(18,16,14,0.6) 60%, rgba(18,16,14,0) 100%)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        opacity: pastOverture ? 1 : 0,
        pointerEvents: pastOverture ? undefined : "none",
      }}
    >
      <div className="pointer-events-auto flex items-baseline gap-3 text-paper">
        <span className="display italic text-[22px] tracking-tight">pogofish</span>
        <span className="mono text-[9px] tracking-[0.3em] uppercase text-paper-3 hidden sm:inline">
          &middot; {STRINGS.chrome.tagline[lang]}
        </span>
      </div>
      <a
        href="#chapter-x"
        className="pointer-events-auto mono text-[10px] tracking-[0.25em] uppercase text-paper-3 hover:text-vermilion transition-colors"
      >
        {STRINGS.chrome.skipToPlay[lang]}
      </a>
    </header>
  );
}

function StoryFooter() {
  const { lang } = useLang();
  return (
    <footer className="relative z-10 border-t border-hair px-6 py-10 mt-24">
      <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <div className="display italic text-2xl">pogofish</div>
          <div className="mono text-[10px] tracking-[0.28em] uppercase text-paper-3">
            {STRINGS.chrome.footerTag[lang]}
          </div>
        </div>
        <div className="mono text-[11px] text-paper-3 max-w-xs">
          {STRINGS.chrome.madeWithCare[lang]}{" "}
          <a href="https://william.revah.paris" className="text-paper hover:text-vermilion underline underline-offset-4">
            William
          </a>
          .
        </div>
      </div>
    </footer>
  );
}

/* ---------------- scenes 2–6: pinned sidecar ---------------- */

function PinnedStory() {
  const { lang } = useLang();
  const { refs, active } = useActiveIndex(5);
  const stage = useStage();
  const sectionRef = useRef<HTMLElement>(null);
  const pinLabelKeys: (keyof typeof STRINGS.pinned.labels)[] = [
    "opening", "theClaim", "sixDays", "theRules", "equilibrium",
  ];
  const pinLabelKey = pinLabelKeys[active] ?? pinLabelKeys[0]!;
  const pinLabel = STRINGS.pinned.labels[pinLabelKey][lang];

  // Each pinned panel drives the persistent stage to a different game frame
  // AND a different camera/mode/glow so chapters feel distinct.
  // Frames mirror PINNED_BOARDS in data.ts.
  const panelStageViews: Array<Parameters<typeof stage.setView>[0]> = [
    // III · opening — clean, wide, contemplative
    { frameIdx: 0,  x: 0.22, y: 0.5,  scale: 0.64, rotate: 0,    mode: "standard", focusCell: null, glow: 0.30 },
    // IV · the claim — slight tilt, warmer glow (the bad answer is being given)
    { frameIdx: 2,  x: 0.22, y: 0.5,  scale: 0.64, rotate: -1.5, mode: "standard", focusCell: null, glow: 0.45 },
    // V · six days — board pushed up slightly, brighter glow (peak stress)
    { frameIdx: 8,  x: 0.22, y: 0.46, scale: 0.64, rotate: 0,    mode: "standard", focusCell: null, glow: 0.62 },
    // VI · the tree had no leaves — exploded mode focuses on b2 (the equilibrium cell)
    { frameIdx: 11, x: 0.22, y: 0.5,  scale: 0.62, rotate: 0,    mode: "exploded", focusCell: 4,    glow: 0.45 },
    // VII · rules became variable — fanout: ghost copies fan behind the main board
    { frameIdx: 10, x: 0.22, y: 0.5,  scale: 0.62, rotate: 0.8,  mode: "fanout",   focusCell: null, glow: 0.50 },
  ];

  // Apply the view ONLY when (a) the active panel changes or (b) the
  // section first enters its active range. Without the !wasActive gate
  // this fires on every scroll-tick while PinnedStory is partially in
  // view, which races with the next section's StageBinder hide() call
  // and ends up painting the persistent board on top of Chapter VIII.
  useEffect(() => {
    const apply = () => {
      const view = panelStageViews[active] ?? panelStageViews[0]!;
      stage.setView({ ...view, opacity: 1 });
    };

    let frame = 0;
    let wasActive = false;
    const evaluate = () => {
      frame = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const isActive = rect.top < vh * 0.7 && rect.bottom > vh * 0.3;
      if (isActive && !wasActive) apply();
      wasActive = isActive;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(evaluate);
    };
    // Fire once on mount or panel change. wasActive starts false so the
    // first evaluate() during an active range applies the view.
    evaluate();
    if (wasActive === false && sectionRef.current) {
      // edge case: if mount-time evaluate found us inactive (above the
      // section), the listener will catch us on the way in.
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The act 1 → 2 pivot lives inside PinnedStory: panels 0–1 are still
  // the kitchen-table game (act 1); panel 2 is "the night William opens
  // his laptop" — chapter V — and the page goes to terminal black for
  // the rest of the run. Updating data-act on the section AND on the
  // <html> root so fixed chrome follows.
  const currentAct: 1 | 2 = active < 2 ? 1 : 2;
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < vh * 0.5 && r.bottom > vh * 0.5) {
        document.documentElement.setAttribute("data-act", String(currentAct));
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [currentAct]);

  return (
    <section
      ref={sectionRef}
      data-act={currentAct}
      className="act-surface relative transition-colors duration-700"
    >
      <div className="mx-auto max-w-6xl px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[minmax(280px,_340px)_minmax(0,_1fr)] gap-10 lg:gap-20">
        {/* the persistent <Stage> renders the board behind us; this column
            holds a chapter card (numeral + progress dots + label) and a
            spacer the size of the board for layout stability. */}
        <aside className="hidden lg:block">
          {/* Chapter card hugs the top and bottom of the sticky pane so it
              never overlaps the persistent board, which paints in the middle.
              Numeral + position label up top; chapter label + progress dots
              down low. The middle vertical band is reserved for the board. */}
          <div className="sticky top-0 h-screen pointer-events-none">
            <motion.div
              key={`pin-numeral-${active}`}
              initial={{ opacity: 0, y: -10, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-[10vh] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
            >
              <span
                className="display-italic text-vermilion select-none leading-none"
                style={{ fontSize: "clamp(3rem, 4.4vw, 4.4rem)" }}
              >
                {CHAPTER_NUMERAL_PIN[active] ?? "III"}
              </span>
              <span className="mono text-[9px] tracking-[0.35em] uppercase text-paper-3">
                {tf(STRINGS.pinned.positionOf[lang], { n: active + 1 })}
              </span>
            </motion.div>

            <div className="absolute bottom-[10vh] left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
              <motion.div
                key={`pin-label-${active}`}
                initial={{ opacity: 0, y: 6, clipPath: "inset(0 100% 0 0)" }}
                animate={{ opacity: 1, y: 0, clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                className="display-italic text-xl text-paper-2 whitespace-nowrap"
              >
                {pinLabel}
              </motion.div>

              <div className="flex items-center gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    className="block rounded-full"
                    animate={{
                      width: i === active ? 22 : 6,
                      height: 2,
                      backgroundColor:
                        i < active
                          ? "var(--color-vermilion-deep)"
                          : i === active
                          ? "var(--color-vermilion)"
                          : "var(--color-graphite)",
                    }}
                    transition={{ type: "spring", stiffness: 280, damping: 24 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex flex-col">
          {/* III — the game and the experiment */}
          <NarrativePanel
            id="chapter-iii"
            sectionRef={(el) => { refs.current[0] = el; }}
            chapter={CHAPTER_NUMERAL.III}
            kicker={STRINGS.chapters.III[lang]}
          >
            <MobileChapterBoard frameIdx={panelStageViews[0]!.frameIdx} glow={panelStageViews[0]!.glow} act={1} />
            <EnFr
              en={<>
                <p className="dropcap">
                  Pogo arrived in my life by way of a friend who had
                  the box and explained the rules across a dining table one
                  evening. Three rows, three columns, twelve pieces, no dice
                  and no hidden cards — both players see everything, like in
                  chess. The rules took five minutes to learn. The game took
                  rather longer to forget.
                </p>
                <p>
                  What I was actually after, that month, was a{" "}
                  <Term term="RL">reinforcement-learning</Term> experiment.
                  RL — reinforcement learning — is the branch of machine
                  learning where a program is taught to play a game by
                  letting it play that game against itself, thousands or
                  millions of times, until something resembling skill emerges
                  from the noise. It is the technique behind the programs
                  that beat the world champions at Go, at chess, at almost
                  every game anyone has bothered to point it at — and it is
                  famously expensive: the heavy-hitters consume small data
                  centres for weeks at a stretch.
                </p>
                <p>
                  I did not have a small data centre. I had eight
                  gigabytes of RAM. What I wanted was a game small enough
                  that the experiment could fit on a laptop — train,
                  evaluate, and play against the result, all on one machine,
                  in time I could measure in days rather than months.
                </p>
                <p>
                  Pogo, three rows by three columns, looked very much like
                  that game.
                </p>
              </>}
              fr={<>
                <p className="dropcap">
                  Pogo est entré dans ma vie par un ami qui en
                  avait la boîte et m'en a expliqué les règles sur un coin
                  de table un soir. Trois lignes, trois colonnes, douze
                  pièces, ni dé ni carte cachée — les deux joueurs voient
                  tout, comme aux échecs. Les règles s'apprennent en cinq
                  minutes. Le jeu, lui, met plus longtemps à s'oublier.
                </p>
                <p>
                  Ce que je cherchais, ce mois-là, c'était une expérience d'
                  <Term term="RL">apprentissage par renforcement</Term>. Le
                  RL — la branche du machine learning où l'on apprend à un
                  programme à jouer en le faisant jouer contre lui-même, des
                  milliers ou des millions de fois, jusqu'à ce qu'une chose
                  qui ressemble à un savoir émerge du bruit. C'est la
                  méthode derrière les programmes qui ont battu les
                  champions du monde au Go, aux échecs, à peu près à tout
                  ce qu'on leur a posé sur la table — et c'est, notoirement,
                  coûteux : les gros joueurs consomment de petits data
                  centers pendant des semaines.
                </p>
                <p>
                  Je n'avais pas de petit data center. J'avais huit
                  gigaoctets de RAM. Ce que je voulais, c'était un jeu assez
                  petit pour que l'expérience tienne sur un laptop —
                  entraîner, évaluer, et affronter le résultat, sur la même
                  machine, dans un temps qui se compterait en jours plutôt
                  qu'en mois.
                </p>
                <p>
                  Pogo, trois lignes sur trois colonnes, ressemblait
                  beaucoup à ce jeu.
                </p>
              </>}
            />
            <EnFr
              en={<p>I did not write the first line of code that evening. I opened a chat with Claude — a general-purpose AI I had been using for months — to plan the experiment.</p>}
              fr={<p>Je n'ai pas écrit la première ligne de code ce soir-là. J'ai ouvert un chat avec Claude — une IA générale que j'utilisais depuis plusieurs mois — pour planifier l'expérience.</p>}
            />
          </NarrativePanel>

          {/* IV — the planning chat */}
          <NarrativePanel
            id="chapter-iv"
            sectionRef={(el) => { refs.current[1] = el; }}
            chapter={CHAPTER_NUMERAL.IV}
            kicker={STRINGS.chapters.IV[lang]}
          >
            <MobileChapterBoard frameIdx={panelStageViews[1]!.frameIdx} glow={panelStageViews[1]!.glow} act={1} />
            <EnFr
              en={<>
                <p>
                  In the chat, I described what I wanted: an RL agent
                  that learns Pogo by playing itself, on my laptop, in days.
                  I asked Claude how to structure the project.
                </p>
                <p>
                  Claude came back with a five-phase plan. Phase one, a
                  Python game engine — a sandbox for an RL agent to interact
                  with. Phase two, a{" "}
                  <Term term="Minimax">minimax</Term> solver: a brute-force
                  algorithm that reads every move from the current position,
                  then every reply, then every reply to that, all the way to
                  the end of the game, and propagates the verdicts back. Run
                  it once, ahead of time, and you get a complete map of
                  every reachable Pogo position with its true value attached
                  — the ground truth against which to measure whatever the
                  network later learns. Phases three and four, the RL
                  itself: tabular Q-learning as a baseline, then deep RL on
                  top of it. Phase five, an interactive page where any
                  reader can play the trained network.
                </p>
                <p>
                  I had not known about minimax going in. Once Claude
                  laid out the rationale — solve first, train against the
                  solution — it landed cleanly. The plan made sense.
                </p>
                <p>
                  Only one practical question remained: was Pogo small
                  enough for the brute-force phase to finish in a reasonable
                  time on a laptop with eight gigabytes of RAM?
                </p>
              </>}
              fr={<>
                <p>
                  Dans le chat, j'ai décrit ce que je voulais : un agent
                  RL qui apprenne à jouer à Pogo en s'affrontant lui-même,
                  sur mon laptop, en quelques jours. J'ai demandé à Claude
                  comment structurer le projet.
                </p>
                <p>
                  Claude est revenu avec un plan en cinq phases. Phase un,
                  un moteur de jeu en Python — un bac à sable où un agent RL
                  peut interagir avec les règles. Phase deux, un solveur{" "}
                  <Term term="Minimax">minimax</Term> : un algorithme par
                  force brute qui lit tous les coups possibles depuis la
                  position courante, puis toutes les ripostes, puis les
                  ripostes aux ripostes, jusqu'à la fin de la partie, et
                  fait remonter les verdicts. Lancé une fois, en amont, il
                  produit la carte complète de chaque position atteignable
                  avec sa valeur exacte — la vérité terrain contre laquelle
                  mesurer ce que le réseau apprendra ensuite. Phases trois
                  et quatre, le RL lui-même : Q-learning tabulaire comme
                  référence, puis deep RL par-dessus. Phase cinq, une page
                  interactive où n'importe quel lecteur peut affronter le
                  réseau entraîné.
                </p>
                <p>
                  Je ne connaissais pas le minimax avant cette
                  conversation. Une fois la logique posée — résoudre d'abord,
                  entraîner contre la solution — la chose tenait. Le plan
                  faisait sens.
                </p>
                <p>
                  Restait une seule question pratique : est-ce que Pogo
                  était assez petit pour que la phase de force brute se
                  termine en un temps raisonnable sur un laptop de huit
                  gigaoctets ?
                </p>
              </>}
            />
            <GuessReachable />
            <TranscriptCard
              header={STRINGS.transcript.header[lang]}
              body={
                <>
                  <span className="text-paper-3">{STRINGS.transcript.prompt[lang]}</span>
                  <br />
                  {STRINGS.transcript.answerA[lang]}
                  <span className="text-vermilion">{STRINGS.transcript.answerB[lang]}</span>
                  {STRINGS.transcript.answerC[lang]}
                </>
              }
            />
            <EnFr
              en={<>
                <p>
                  The estimate sounded fine. A million positions, brute-forced
                  in an afternoon, was no obstacle to the project; it would
                  get out of the way of the more interesting RL work. I
                  agreed to the plan and asked Claude to write the engine.
                </p>
                <p>
                  The estimate would turn out to be wrong by a factor of
                  fifty.
                </p>
              </>}
              fr={<>
                <p>
                  L'estimation tenait. Un million de positions passées à la
                  moulinette en un après-midi, ce n'était pas un obstacle —
                  ça libérait le terrain pour la partie RL, plus
                  intéressante. J'ai validé le plan et demandé à
                  Claude d'écrire le moteur.
                </p>
                <p>
                  L'estimation allait s'avérer fausse d'un facteur cinquante.
                </p>
              </>}
            />
          </NarrativePanel>

          {/* V — twelve days, two losses */}
          <NarrativePanel
            id="chapter-v"
            sectionRef={(el) => { refs.current[2] = el; }}
            chapter={CHAPTER_NUMERAL.V}
            kicker={STRINGS.chapters.V[lang]}
          >
            <MobileChapterBoard frameIdx={panelStageViews[2]!.frameIdx} glow={panelStageViews[2]!.glow} act={2} />
            <Marginalia stamp="d1 09:14">
              <EnFr
                en={<>solver up. table=812k. growth +12%/h. nominal.</>}
                fr={<>solveur lancé. table=812k. croissance +12%/h. nominal.</>}
              />
            </Marginalia>
            <EnFr
              en={<>
                <p>
                  The engine came together in two days. Claude wrote it;
                  I read each commit, asked questions, ran the test
                  fixtures the engine shipped with. Phase one, done.
                </p>
                <p>
                  The minimax solver came next. Claude wrote it in Python,
                  alongside the engine. The two pieces of standard
                  machinery from thirty years of game-tree research went in:
                  {" "}<Term term="Alpha-beta pruning">alpha-beta pruning</Term>{" "}
                  (skip a branch as soon as another has been proved better)
                  and a{" "}
                  <Term term="Transposition table">transposition table</Term>
                  {" "}(cache the value of every position seen, so the same
                  one isn't recomputed when reached by a different path of
                  moves). Nothing exotic. On paper, the kind of solver that
                  finishes a million positions over lunch.
                </p>
                <p>
                  I launched it, watched the first few hundred
                  positions get scored, and went to do something else. I
                  kept Claude posted. Day one, table at eight hundred
                  thousand entries, growth nominal. Day two, slower,
                  plausible. Day three, the curve was already shaped like
                  nothing anyone recognised. Day five, it was climbing
                  nearly vertical. On the morning of day six, the operating
                  system killed the process — out of memory, thirty-six
                  gigabytes resident, forty-nine million entries in the
                  table, and not a single value had made it back to the
                  root. Six days, no answer, no checkpoint on disk.
                </p>
              </>}
              fr={<>
                <p>
                  Le moteur a tenu en deux jours. Claude l'a écrit ;
                  j'ai lu chaque commit, posé des questions, lancé les
                  fixtures de test livrées avec. Phase un, faite.
                </p>
                <p>
                  Le solveur minimax est venu ensuite. Claude l'a écrit en
                  Python, en parallèle du moteur. Les deux outils standards
                  de trente ans de recherche en arbres de jeu y étaient :
                  l'<Term term="Alpha-beta pruning">élagage alpha-bêta</Term>
                  {" "}(jeter une branche dès qu'on a prouvé qu'une autre est
                  meilleure) et une{" "}
                  <Term term="Transposition table">table de transposition</Term>
                  {" "}(mémoriser la valeur de chaque position rencontrée
                  pour ne pas la recalculer si on y revient par un autre
                  chemin). Rien d'exotique. Sur le papier, le genre de
                  solveur qui ratisse un million de positions entre midi et
                  deux.
                </p>
                <p>
                  Je l'ai lancé, j'ai regardé les premières centaines de
                  positions s'évaluer, et je suis parti faire autre chose. Je
                  tenais Claude au courant. Jour un, table à huit cent mille
                  entrées, croissance nominale. Jour deux, plus lente,
                  plausible. Jour trois, la courbe ne ressemblait déjà plus
                  à rien de connu. Jour cinq, elle montait presque à la
                  verticale. Au matin du sixième, le système d'exploitation
                  a tué le processus — plus de mémoire, trente-six
                  gigaoctets résidents, quarante-neuf millions d'entrées
                  dans la table, et pas une seule valeur remontée à la
                  racine. Six jours, aucune réponse, aucun snapshot sur
                  disque.
                </p>
              </>}
            />
            <Marginalia stamp="d6 07:42">
              <EnFr
                en={<>oom-kill: pid=4711, rss=36.2GB. exit 137. no checkpoint.</>}
                fr={<>oom-kill : pid=4711, rss=36,2Go. exit 137. aucun snapshot.</>}
              />
            </Marginalia>
            <SixDaysChart />
            <WrongAnswerSlam />
            <EnFr
              en={<>
                <p>
                  I got lucky once. The solver had been running in a
                  bash shell inside a Claude Code session, which meant the
                  dead process's memory image was still reachable from
                  inside the same session: between us, Claude and I pulled the
                  value table out of RAM into a Pickle file before the
                  session ended. On paper, the six days of compute were
                  salvaged.
                </p>
                <p>
                  On the strength of that recovery, I asked Claude
                  whether it was safe to relaunch — outside the session
                  this time, on a fresh terminal, with a longer leash.
                  Claude said yes.
                </p>
                <p>
                  It wasn't. The second run blew up the same way at day
                  six, with no Claude Code memory underneath to fish out.
                  This time there was nothing to recover. Twelve days of
                  compute, gone. A near-empty log file, a fan that had been
                  quiet for a week, and a diagnosis still owed.
                </p>
              </>}
              fr={<>
                <p>
                  J'ai eu de la chance, une fois. Le solveur tournait
                  dans un bash à l'intérieur d'une session Claude Code, ce
                  qui voulait dire que l'image mémoire du processus mort
                  était encore accessible depuis la même session : à nous
                  deux, Claude et moi avons sorti la table de valeurs de la RAM dans
                  un fichier Pickle avant la fin de la session. Sur le
                  papier, les six jours de calcul étaient sauvés.
                </p>
                <p>
                  Fort de cette récupération, j'ai demandé à Claude
                  si on pouvait relancer — cette fois en dehors de la
                  session, dans un terminal frais, avec plus de marge.
                  Claude a dit oui.
                </p>
                <p>
                  Ce n'était pas vrai. Le second run est tombé de la même
                  manière au sixième jour, sans Claude Code dessous pour
                  récupérer la mémoire. Cette fois, rien à sauver. Douze
                  jours de calcul, perdus. Un fichier de logs à peu près
                  vide, un ventilateur silencieux depuis une semaine, et
                  un diagnostic à faire.
                </p>
              </>}
            />
          </NarrativePanel>

          {/* VI — the diagnosis */}
          <NarrativePanel
            id="chapter-vi"
            sectionRef={(el) => { refs.current[3] = el; }}
            chapter={CHAPTER_NUMERAL.VI}
            kicker={STRINGS.chapters.VI[lang]}
          >
            <MobileChapterBoard frameIdx={panelStageViews[3]!.frameIdx} glow={panelStageViews[3]!.glow} act={2} />
            <Marginalia stamp="diagnosis">
              <EnFr
                en={<>cycle? → not detected. same state filed N times, one per path.</>}
                fr={<>cycle ? → non détecté. même état rangé N fois, une par chemin.</>}
              />
            </Marginalia>
            <EnFr
              en={<>
                <p>
                  After the second loss, Claude and I sat down with the
                  source code and worked out what had actually been going
                  on.
                </p>
                <p>
                  The cause was small. Pogo has no captures: pieces never
                  leave the board, they only restack. A given position can
                  therefore be reached not just by one sequence of moves
                  but by many — including sequences that loop back through
                  it. Two careful players can shuffle the same three pieces
                  between the same three cells indefinitely. The same is
                  true of a search algorithm: nothing in a textbook minimax
                  stops it from going round the same circle thousands of
                  times, filing each lap as a fresh path.
                </p>
                <p>
                  That is what had eaten thirty-six gigabytes. The
                  forty-nine million entries the solver had stockpiled were
                  not forty-nine million distinct Pogo positions — many
                  were the same handful of positions filed under different
                  routes. The transposition table couldn't catch it: it
                  indexes positions, not paths, and there was nothing
                  telling the route that led to a stored position that the
                  route was itself going in circles.
                </p>
                <p>
                  The fix is well-known. When the search encounters a
                  position it has already visited earlier in the current
                  line of play, treat that branch as a draw and back out.
                  Two extra lines of code, three with the comment. Claude
                  wrote them.
                </p>
                <p>
                  While we were in the code, we noticed something
                  else. Pogo's win condition — a player loses when no cell
                  on the board has their colour on top, leaving them with
                  no legal move — left room, in theory, for two careful
                  players to settle into a stable, mutually inert
                  configuration that neither side wanted to disturb. In
                  casual play this almost never happens. Against a search
                  that tried everything, it happened constantly. The game
                  needed a sharper way to end, not just for the algorithm
                  but for the game itself to feel like a game.
                </p>
              </>}
              fr={<>
                <p>
                  Après le second échec, Claude et moi nous sommes installés
                  devant le code source et avons compris ce qui s'était
                  réellement passé.
                </p>
                <p>
                  La cause était petite. Pogo n'a pas de captures : les
                  pièces ne quittent jamais le plateau, elles s'empilent.
                  Une même position peut donc être atteinte non par une
                  seule suite de coups, mais par plusieurs — y compris des
                  suites qui la traversent en boucle. Deux joueurs prudents
                  peuvent se renvoyer les mêmes trois pièces entre les
                  mêmes trois cases indéfiniment. C'est aussi vrai pour un
                  algorithme de recherche : rien dans un minimax classique
                  ne l'empêche de faire mille fois le tour du même cycle,
                  en enregistrant chaque tour comme un nouveau chemin.
                </p>
                <p>
                  Voilà ce qui avait avalé trente-six gigaoctets. Les
                  quarante-neuf millions d'entrées que le solveur avait
                  accumulées n'étaient pas quarante-neuf millions de
                  positions distinctes — beaucoup étaient la même poignée
                  de positions rangées sous des suites de coups
                  différentes. La table de transposition ne pouvait rien :
                  elle indexe les positions, pas les chemins, et rien ne
                  disait à la route qui menait à une position stockée
                  qu'elle-même tournait en rond.
                </p>
                <p>
                  Le correctif est connu. Quand la recherche rencontre une
                  position qu'elle a déjà visitée plus haut dans la même
                  ligne de jeu, on traite cette branche comme un nul et on
                  rebrousse chemin. Deux lignes de code ajoutées, trois
                  avec le commentaire. Claude les a écrites.
                </p>
                <p>
                  Pendant que nous étions dans le code, nous avons remarqué
                  autre chose. La condition de défaite de Pogo — on perd
                  quand plus aucune case du plateau n'a sa couleur au
                  sommet, et donc quand on n'a plus de coup légal —
                  laissait en théorie la place, à deux joueurs prudents,
                  à une configuration stable et mutuellement inerte que
                  personne n'avait envie de bouger. Dans une partie
                  ordinaire ça n'arrive presque jamais. Pour une recherche
                  qui essaie tout, ça arrivait sans cesse. Il fallait au
                  jeu une manière plus nette de se terminer, non seulement
                  pour l'algorithme mais pour que le jeu en soit un.
                </p>
              </>}
            />
            <TreeDiagram />
            <PullQuote>
              <EnFr
                en={<>Twelve days of compute. Two lines of code. Three with the comment.</>}
                fr={<>Douze jours de calcul. Deux lignes de code. Trois avec le commentaire.</>}
              />
            </PullQuote>
          </NarrativePanel>

          {/* VII — the rule, the rerun, the depth that wasn't enough */}
          <NarrativePanel
            id="chapter-vii"
            sectionRef={(el) => { refs.current[4] = el; }}
            chapter={CHAPTER_NUMERAL.VII}
            kicker={STRINGS.chapters.VII[lang]}
          >
            <MobileChapterBoard frameIdx={panelStageViews[4]!.frameIdx} glow={panelStageViews[4]!.glow} act={2} />
            <EnFr
              en={<>
                <p>
                  The rule rewrite was small. We added one rule: if the
                  same position recurs three times in a game, the player to
                  move loses. A repeat once or twice is just normal
                  back-and-forth. Three times is a sign nobody wants to
                  commit. That was enough to give the game an unambiguous
                  way to end, even between two players who had silently
                  agreed to do nothing.
                </p>
                <p>
                  With the search bug fixed and the rule added at the board
                  level, Claude reran the solver. It finished in fifty-four
                  minutes. Nine and a half million distinct positions seen,
                  of which roughly nine hundred and seventy-five thousand
                  turned out to be decisive — one side or the other had a
                  forced win — and the rest were draws. From the opening
                  position, with both sides playing the strongest move
                  available, the game is a draw.
                </p>
              </>}
              fr={<>
                <p>
                  La modification était petite. Une règle ajoutée : si la
                  même position revient trois fois dans une partie, le
                  joueur au trait perd. Une répétition une ou deux fois
                  fait partie du jeu normal ; trois fois, c'est le signe
                  que personne ne veut s'engager. Cela suffisait à donner
                  au jeu une fin sans ambiguïté, même entre deux joueurs
                  qui s'étaient tacitement mis d'accord pour ne rien faire.
                </p>
                <p>
                  Avec le bug du moteur de recherche corrigé et la règle
                  ajoutée au niveau du jeu, Claude a relancé le solveur. Il
                  a tourné cinquante-quatre minutes. Neuf millions huit
                  cent mille positions distinctes vues, dont environ neuf
                  cent soixante-quinze mille décisives — un camp ou l'autre
                  y avait un gain forcé — et le reste, des nuls. Depuis la
                  position de départ, les deux côtés jouant le meilleur
                  coup possible, la partie est nulle.
                </p>
              </>}
            />
            <PullQuote>{STRINGS.pullQuote[lang]}</PullQuote>
            <EnFr
              en={<>
                <p>
                  Phase two of the original plan: done. But the result came
                  with a footnote. To keep memory bounded, the solver had
                  been capped at twenty half-moves of search depth, then
                  declared anything still undecided a draw. Pogo, it turns
                  out, is deeper than twenty half-moves. Some of those
                  "draws" are positions whose true value can only be
                  settled by looking further. Brute force can take Pogo to
                  twenty. It cannot take it further.
                </p>
                <p>
                  Which is, on reflection, the right setup for the
                  experiment I had wanted from the start. Everything
                  brute force can prove has now been proved. Everything
                  beyond that — the positions undecided at twenty
                  half-moves — is exactly where reinforcement learning
                  earns its place. If a network, after enough self-play,
                  outplays the partial oracle on the deep positions, that
                  is a real result.
                </p>
                <p>
                  The variants the project ended up testing are small
                  variations on that one terminating rule: different
                  repetition counts, different move budgets, the odd
                  tie-breaker. The next chapter is a tour of them and a
                  verdict on which ones are actually worth playing.
                </p>
              </>}
              fr={<>
                <p>
                  Phase deux du plan d'origine : faite. Mais le résultat
                  arrive avec une note de bas de page. Pour garder la
                  mémoire bornée, le solveur avait été plafonné à vingt
                  demi-coups de recherche, et tout ce qui restait indécis
                  à cette profondeur était classé nul. Pogo, on l'apprend
                  par là, est plus profond que vingt demi-coups. Certains
                  de ces « nuls » sont des positions dont la vraie valeur
                  ne se règle qu'en regardant plus loin. La force brute
                  mène Pogo jusqu'à vingt. Pas plus loin.
                </p>
                <p>
                  C'est, à la réflexion, le bon cadre pour l'expérience
                  que je voulais dès le départ. Tout ce que la force
                  brute peut prouver est maintenant prouvé. Le reste — les
                  positions encore indécises à vingt demi-coups — est
                  exactement le terrain où l'apprentissage par
                  renforcement justifie sa place. Si un réseau, après
                  assez d'auto-jeu, surpasse l'oracle partiel sur les
                  positions profondes, c'est un résultat réel.
                </p>
                <p>
                  Les variantes que le projet a fini par tester sont de
                  petites variations autour de cette règle de fin :
                  nombres de répétitions différents, plafonds de coups
                  différents, un départage de temps en temps. Le chapitre
                  suivant en fait le tour, et le verdict trie celles qui
                  valent la peine d'être jouées.
                </p>
              </>}
            />
          </NarrativePanel>
        </div>
      </div>
    </section>
  );
}

/* ---------------- narrative building blocks ---------------- */

type PanelProps = {
  chapter: string;
  kicker: string;
  children: React.ReactNode;
  sectionRef?: (el: HTMLElement | null) => void;
  id?: string;
};

/** Cinematic chapter head whose visual register changes per act:
 *
 *  Act 1 (cream paper) — italic Roman numeral with a slight pencil-red
 *    rotation, hand-touched. Kicker in regular kicker mono.
 *  Act 2 (terminal) — numeral wrapped in ASCII brackets ([ V ]) with a
 *    blinking phosphor cursor underneath. Kicker in monospace UPPERCASE.
 *  Act 3 (paper) — a slim italic numeral over a thin horizontal rule,
 *    kicker in small-caps display, archival.
 *
 *  The animation choreography (drop, hairline draw, kicker wipe) stays
 *  consistent so the article still beats in time across acts.
 */
function ChapterHead({
  numeral,
  kicker,
  size = "section",
}: {
  numeral: string;
  kicker: string;
  /** "section" (full-bleed scenes) sizes smaller than "panel" (NarrativePanel intro). */
  size?: "section" | "panel";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const act = useAct(ref);
  const numeralFs =
    size === "panel"
      ? "clamp(5rem, 12vw, 10rem)"
      : "clamp(4rem, 9vw, 8rem)";

  return (
    <div ref={ref} className="space-y-3 mb-8">
      {act === 2 ? (
        <ChapterNumeralAct2 numeral={numeral} fontSize={numeralFs} />
      ) : (
        <motion.span
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="display-italic block leading-[0.85] text-vermilion select-none"
          style={{
            fontSize: numeralFs,
            letterSpacing: "-0.04em",
            // Act 1 — slight pencil-style rotation for hand-drawn feel.
            // Act 3 — perfectly upright, archival.
            transform: act === 1 ? "rotate(-2deg)" : undefined,
            transformOrigin: "left bottom",
          }}
        >
          {numeral}
        </motion.span>
      )}
      <motion.span
        aria-hidden
        className="block bg-vermilion origin-left"
        style={{
          // Act 3 — a thicker, calmer rule (a published-paper section break).
          height: act === 3 ? 2 : 1,
          opacity: act === 3 ? 0.85 : 1,
        }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 1.0, ease: [0.6, 0, 0.2, 1], delay: 0.25 }}
      />
      <motion.div
        initial={{ opacity: 0, y: 6, clipPath: "inset(0 100% 0 0)" }}
        whileInView={{ opacity: 1, y: 0, clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        className="kicker"
        style={{
          // Act 3 — small caps display lettering instead of mono.
          fontFamily:
            act === 3 ? "var(--font-display, serif)" : undefined,
          fontStyle: act === 3 ? "italic" : undefined,
          textTransform: act === 3 ? "lowercase" : undefined,
          fontSize: act === 3 ? "1.05rem" : undefined,
          letterSpacing: act === 3 ? "0.04em" : undefined,
        }}
      >
        {kicker}
      </motion.div>
    </div>
  );
}

/** Act 2 numeral — wrapped in ASCII brackets with a blinking cursor below.
 *  The cursor is the only "live" element on screen for a beat, signalling
 *  that the page now reads as a terminal. */
function ChapterNumeralAct2({
  numeral,
  fontSize,
}: {
  numeral: string;
  fontSize: string;
}) {
  return (
    <motion.div
      {...fadeUp}
      viewport={{ once: true, margin: "-15%" }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-baseline gap-3 select-none"
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize,
        lineHeight: 0.9,
        color: "var(--color-vermilion)",
        letterSpacing: "0.05em",
      }}
    >
      <span style={{ opacity: 0.55 }}>[</span>
      <span style={{ fontWeight: 700 }}>{numeral}</span>
      <span style={{ opacity: 0.55 }}>]</span>
      <motion.span
        aria-hidden
        animate={{ opacity: [1, 1, 0, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          display: "inline-block",
          marginLeft: "0.35em",
          width: "0.5em",
          height: "0.85em",
          background: "var(--color-vermilion)",
          alignSelf: "center",
        }}
      />
    </motion.div>
  );
}

/** Backwards-compat alias — a few section heads still call SectionChapterHead. */
function SectionChapterHead({
  numeral,
  kicker,
}: {
  numeral: string;
  kicker: string;
}) {
  return <ChapterHead numeral={numeral} kicker={kicker} size="section" />;
}

/** Mobile-only inline board at the top of each pinned chapter. On lg+ the
 *  persistent floating Stage carries the board; below lg it is hidden, so
 *  without this the signature device — a board that morphs frame-by-frame and
 *  ages act-by-act — never reaches phone readers (where most arrive). Standard
 *  mode keeps the in-flow SVG from overflowing on narrow screens; the frame and
 *  the act still change per chapter, which is the whole point. */
function MobileChapterBoard({
  frameIdx = 0,
  glow = 0.4,
  act,
}: {
  frameIdx?: number;
  glow?: number;
  act: 1 | 2 | 3;
}) {
  return (
    <div className="lg:hidden mb-8 flex justify-center" aria-hidden>
      <div style={{ width: "min(72vw, 320px)" }}>
        <FinaleSvgBoard
          frameIdx={frameIdx}
          mode="standard"
          glow={glow}
          act={act}
          instant
          className="w-full h-full"
        />
      </div>
    </div>
  );
}

function NarrativePanel({ chapter, kicker, children, sectionRef, id }: PanelProps) {
  return (
    <section id={id} ref={sectionRef} className="min-h-screen flex items-center py-28">
      <div className="space-y-6 w-full max-w-[58ch]">
        <ChapterHead numeral={chapter} kicker={kicker} size="panel" />
        <motion.div
          {...fadeUp}
          initial={{ opacity: 0, y: 16 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.6 }}
          className="space-y-5 text-paper text-[1.0625rem] md:text-[1.125rem] leading-[1.75]"
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}

function TranscriptCard({ header, body }: { header: string; body: React.ReactNode }) {
  return (
    <motion.div
      {...fadeUp}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      className="border border-hair bg-ink-2 rounded-sm px-5 py-4 my-8 relative shadow-2xl"
      style={{
        boxShadow: "0 28px 50px -30px rgba(0,0,0,0.7), 0 0 50px -28px rgba(217,79,44,0.35)",
      }}
    >
      <motion.div
        aria-hidden
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-vermilion origin-top"
      />
      <div className="flex items-center gap-2 mono text-[10px] tracking-[0.22em] uppercase text-paper-3 mb-3">
        <motion.span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-vermilion"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {header}
      </div>
      <div className="mono text-[13px] text-paper-2 leading-[1.7]">{body}</div>
    </motion.div>
  );
}

/** A hanging pull quote with a vermilion corner bracket on the left,
 *  so it reads as an editorial extraction rather than a quote. The
 *  bracket is drawn with two short rules at top and bottom and a thicker
 *  vertical rule, all in --color-vermilion which adapts per act
 *  (pencil-red / phosphor / gold). At xl, the whole block hangs slightly
 *  left of the prose column to dramatize the extraction. */
function PullQuote({ children }: { children: React.ReactNode }) {
  const ref = useReveal<HTMLQuoteElement>();
  return (
    <blockquote ref={ref} className="reveal delay-1 pull-quote">
      <span aria-hidden className="pull-quote__bracket" />
      <span className="pull-quote__body pullquote">{children}</span>
    </blockquote>
  );
}

/* ---------------- scene 4 chart ---------------- */

function SixDaysChart() {
  const max = Math.max(...FAILED_RUN_DAYS.map((d) => d.states));
  const width = 560;
  const height = 200;
  const padX = 32;
  const padY = 24;

  const pts = FAILED_RUN_DAYS.map((d, i) => {
    const x = padX + (i / (FAILED_RUN_DAYS.length - 1)) * (width - 2 * padX);
    const y = height - padY - (d.states / max) * (height - 2 * padY);
    return { x, y, ...d };
  });
  const path = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${path} L ${last.x} ${height - padY} L ${first.x} ${height - padY} Z`;

  const { lang } = useLang();
  return (
    <motion.div
      {...fadeUp}
      className="my-8 border border-hair bg-ink-2 rounded-sm p-5"
    >
      <div className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 mb-4 flex justify-between">
        <span>{STRINGS.charts.statesVisited[lang]}</span>
        <span className="text-vermilion">
          <CountUp to={49} suffix="M" />
          <span className="mx-1">·</span>
          <CountUp to={36} suffix=" GB" />
          <span className="mx-2 text-paper-3">·</span>
          {lang === "fr" ? "JOUR 6" : "DAY 6"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={
          lang === "en"
            ? "Line chart. The solver's state table grows nominally for the first two days, then bends near-vertical, reaching 49 million entries and 36 GB of RAM before the kernel kills the process on day six."
            : "Graphique. La table d'états du solveur croît normalement les deux premiers jours, puis grimpe presque à la verticale jusqu'à 49 millions d'entrées et 36 Go de RAM, avant que le noyau ne tue le processus au sixième jour."
        }
      >
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-vermilion)", stopOpacity: 0.28 }} />
            <stop offset="100%" style={{ stopColor: "var(--color-vermilion)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={padX}
            x2={width - padX}
            y1={padY + r * (height - 2 * padY)}
            y2={padY + r * (height - 2 * padY)}
            stroke="var(--color-hair)"
            strokeDasharray="2 4"
          />
        ))}
        <path d={area} fill="url(#area-grad)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-vermilion)"
          strokeWidth="1.8"
          strokeLinecap="round"
          style={{
            strokeDasharray: 800,
            strokeDashoffset: 800,
            animation: "dash 2.4s 0.2s cubic-bezier(0.65,0,0.35,1) forwards",
          }}
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={i === pts.length - 1 ? 4 : 2.5}
              fill={i === pts.length - 1 ? "var(--color-vermilion)" : "var(--color-paper)"}
              opacity="0"
              style={{ animation: `fade-in 0.6s ${0.6 + i * 0.18}s forwards` }}
            />
            <text x={p.x} y={height - 6} fontSize="10" textAnchor="middle" fill="var(--color-paper-3)" fontFamily="JetBrains Mono, monospace">
              d{p.day}
            </text>
          </g>
        ))}
        <line
          x1={last.x}
          y1={padY}
          x2={last.x}
          y2={height - padY}
          stroke="var(--color-vermilion)"
          strokeWidth="0.6"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      </svg>
      <div className="mt-3 flex justify-between mono text-[11px] text-paper-2">
        <span>0</span>
        <span>
          {lang === "en" ? "peak " : "pic "}
          <span className="text-vermilion">{FMT.compact(max)}</span>
          {lang === "en" ? " states · 36\u00A0GB RAM" : " états · 36\u00A0Go RAM"}
        </span>
      </div>
      <SolverLogStream />

      <style>{`@keyframes dash { to { stroke-dashoffset: 0; } }`}</style>
    </motion.div>
  );
}

/** A faux terminal log showing the kind of output the solver would
 *  have printed during the six-day run. Lives inside SixDaysChart so
 *  it inherits whatever act the surrounding section is in (act 2:
 *  phosphor green improvements, rust-orange regressions). */
function SolverLogStream() {
  const { lang } = useLang();
  const lines: { t: string; level: "info" | "warn" | "kill"; en: string; fr: string }[] = [
    { t: "d1 03:14:07", level: "info", en: "alpha-beta search depth=8 branching≈12", fr: "recherche alpha-bêta prof=8 branchement≈12" },
    { t: "d1 11:40:22", level: "info", en: "TT entries: 412,008  hit-rate: 38.4%",   fr: "entrées TT : 412 008  taux : 38,4 %" },
    { t: "d2 07:12:55", level: "info", en: "TT entries: 8,344,207  hit-rate: 41.1%", fr: "entrées TT : 8 344 207  taux : 41,1 %" },
    { t: "d3 14:03:18", level: "warn", en: "growth curve no longer log-shaped",      fr: "courbe de croissance n'est plus logarithmique" },
    { t: "d4 09:45:01", level: "info", en: "TT entries: 27,901,540  RAM: 22.4 GB",   fr: "entrées TT : 27 901 540  RAM : 22,4 Go" },
    { t: "d5 22:56:37", level: "warn", en: "growth curve nearly linear",             fr: "croissance presque linéaire" },
    { t: "d6 08:11:19", level: "info", en: "TT entries: 49,000,000  RAM: 36.0 GB",   fr: "entrées TT : 49 000 000  RAM : 36,0 Go" },
    { t: "d6 08:11:21", level: "kill", en: "killed (oom-killer): pogofish-solver",   fr: "tué (oom-killer) : pogofish-solver" },
  ];
  return (
    <div className="mt-6 border border-hair bg-ink rounded-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hair bg-ink-2">
        <span className="block h-2 w-2 rounded-full bg-vermilion-soft opacity-60" />
        <span className="block h-2 w-2 rounded-full bg-paper-3 opacity-60" />
        <span className="block h-2 w-2 rounded-full bg-paper-3 opacity-30" />
        <span className="ml-2 mono text-[10px] tracking-[0.25em] uppercase text-paper-3">
          {lang === "en" ? "solver.log · tail" : "solver.log · tail"}
        </span>
      </div>
      <ol className="px-4 py-3 mono text-[11px] leading-[1.7] text-paper-2 space-y-0.5">
        {lines.map((l, i) => {
          const isKill = l.level === "kill";
          const isWarn = l.level === "warn";
          const levelColor = isKill
            ? "color-mix(in oklab, var(--color-second) 100%, white 0%)"
            : isWarn
            ? "color-mix(in oklab, var(--color-second-soft) 100%, white 0%)"
            : "var(--color-vermilion)";
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              whileInView={
                isKill
                  ? { opacity: [0, 1, 0.15, 1, 0.5, 1], x: 0 }
                  : { opacity: 1, x: 0 }
              }
              viewport={{ once: true, margin: "-10%" }}
              transition={
                isKill
                  ? {
                      delay: 0.2 + i * 0.16,
                      duration: 1.0,
                      ease: "easeOut",
                      times: [0, 0.18, 0.32, 0.5, 0.66, 1],
                    }
                  : { delay: 0.2 + i * 0.16, duration: 0.4, ease: "easeOut" }
              }
              className="flex gap-3"
              style={
                isKill
                  ? {
                      textShadow:
                        "0 0 12px color-mix(in oklab, var(--color-second) 55%, transparent)",
                    }
                  : undefined
              }
            >
              <span className="text-paper-3 tabular-nums w-[78px] flex-none">{l.t}</span>
              <span
                className="flex-none w-[42px] uppercase tracking-[0.18em]"
                style={{ color: levelColor }}
              >
                {l.level}
              </span>
              <span style={isKill ? { color: "var(--color-second)" } : undefined}>
                {l[lang]}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------- scene 5 tree diagram ---------------- */

function TreeDiagram() {
  const { lang } = useLang();
  // Edges of the binary tree — drawn level by level with stagger.
  const finiteEdges = [
    { x1: 80, y1: 14, x2: 40, y2: 46, level: 0 },
    { x1: 80, y1: 14, x2: 120, y2: 46, level: 0 },
    { x1: 40, y1: 46, x2: 20, y2: 78, level: 1 },
    { x1: 40, y1: 46, x2: 60, y2: 78, level: 1 },
    { x1: 120, y1: 46, x2: 100, y2: 78, level: 1 },
    { x1: 120, y1: 46, x2: 140, y2: 78, level: 1 },
    { x1: 20, y1: 78, x2: 14, y2: 106, level: 2 },
    { x1: 20, y1: 78, x2: 26, y2: 106, level: 2 },
    { x1: 60, y1: 78, x2: 54, y2: 106, level: 2 },
    { x1: 60, y1: 78, x2: 66, y2: 106, level: 2 },
    { x1: 100, y1: 78, x2: 94, y2: 106, level: 2 },
    { x1: 100, y1: 78, x2: 106, y2: 106, level: 2 },
    { x1: 140, y1: 78, x2: 134, y2: 106, level: 2 },
    { x1: 140, y1: 78, x2: 146, y2: 106, level: 2 },
  ];
  const leafXs = [14, 26, 54, 66, 94, 106, 134, 146];

  // The infinite-tree edges fade out at the bottom (no leaves).
  const infiniteEdges: Array<typeof finiteEdges[number] & { fade?: boolean }> =
    finiteEdges.map((e) =>
      e.level === 2 ? { ...e, y2: 110, fade: true } : e,
    );

  return (
    <motion.div
      {...fadeUp}
      initial={{ opacity: 0, y: 20 }}
      className="my-10 grid grid-cols-2 gap-8 border-t border-b border-hair py-6"
    >
      <div className="space-y-3">
        <div className="kicker" style={{ color: "var(--color-paper-3)" }}>
          {STRINGS.charts.whatIDrew[lang]}
        </div>
        <svg
          viewBox="0 0 160 120"
          className="w-full h-auto"
          role="img"
          aria-label={
            lang === "en"
              ? "Diagram of a finite game tree: branches descend from a single root and terminate in leaf nodes — a game that always ends."
              : "Schéma d'un arbre de jeu fini : les branches descendent d'une racine unique et se terminent par des feuilles — un jeu qui finit toujours."
          }
        >
          {/* root */}
          <motion.circle
            cx={80}
            cy={14}
            r={3}
            fill="#ece2cb"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.4, type: "spring", stiffness: 280 }}
          />
          {/* edges grow level by level */}
          {finiteEdges.map((e, i) => (
            <motion.line
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#ece2cb"
              strokeWidth="1"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{
                duration: 0.45,
                ease: "easeOut",
                delay: 0.3 + e.level * 0.35 + (i % 4) * 0.05,
              }}
            />
          ))}
          {/* leaves pop in last */}
          {leafXs.map((x, i) => (
            <motion.circle
              key={x}
              cx={x}
              cy={106}
              r={2.2}
              fill="#d94f2c"
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{
                duration: 0.4,
                type: "spring",
                stiffness: 300,
                damping: 18,
                delay: 1.6 + i * 0.06,
              }}
              style={{ filter: "drop-shadow(0 0 4px rgba(217,79,44,0.7))" }}
            />
          ))}
        </svg>
        <div className="mono text-[11px] text-paper-2">{STRINGS.charts.finiteLeaves[lang]}</div>
      </div>
      <div className="space-y-3">
        <div className="kicker">{STRINGS.charts.whatIWasSolving[lang]}</div>
        <svg
          viewBox="0 0 160 120"
          className="w-full h-auto"
          role="img"
          aria-label={
            lang === "en"
              ? "Diagram of the tree actually being solved: the same branches never reach leaves — they fade into a dashed artificial horizon, because cycles let the game continue forever."
              : "Schéma de l'arbre réellement résolu : les mêmes branches n'atteignent jamais de feuilles — elles s'estompent dans un horizon artificiel en pointillés, car les cycles laissent la partie continuer indéfiniment."
          }
        >
          <motion.circle
            cx={80}
            cy={14}
            r={3}
            fill="#ece2cb"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.4, type: "spring", stiffness: 280 }}
          />
          {infiniteEdges.map((e, i) => (
            <motion.line
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#ece2cb"
              strokeWidth="1"
              opacity={e.fade ? 0.6 : 1}
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{
                duration: 0.45,
                ease: "easeOut",
                delay: 0.3 + e.level * 0.35 + (i % 4) * 0.05,
              }}
            />
          ))}
          {/* artificial horizon — pulses to show "this isn't a real terminator" */}
          <motion.line
            x1={0}
            y1={112}
            x2={160}
            y2={112}
            stroke="#d94f2c"
            strokeDasharray="3 3"
            strokeWidth="0.8"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: [0, 1, 0.5, 1] }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 1.2, delay: 1.5, ease: "easeOut" }}
          />
          <motion.text
            x={80}
            y={120}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize={8}
            fill="#d94f2c"
            {...fadeIn}
            transition={{ duration: 0.5, delay: 2.0 }}
          >
            {STRINGS.charts.artificialHorizon[lang]}
          </motion.text>
        </svg>
        <div className="mono text-[11px] text-vermilion">{STRINGS.charts.infiniteCycles[lang]}</div>
      </div>
    </motion.div>
  );
}

/* ---------------- scene 7: five experiments ---------------- */

function Scene7Experiments() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <section id="chapter-viii" className="relative py-28 md:py-40 px-6 md:px-10">
      <div className="mx-auto max-w-6xl space-y-14">
        <div className="grid lg:grid-cols-[minmax(0,_56ch)_minmax(14rem,_18rem)] gap-12 lg:gap-16 items-start">
        <div ref={ref} className="reveal space-y-6">
          <SectionChapterHead numeral={CHAPTER_NUMERAL.VIII} kicker={STRINGS.chapters.VIII[lang]} />
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)] text-paper leading-[1.08] text-balance">
            {STRINGS.scene7.h2A[lang]}
            <span className="display-italic text-vermilion">{STRINGS.scene7.h2B[lang]}</span>
            {STRINGS.scene7.h2C[lang]}
          </h2>
          <div className="space-y-5 text-paper text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
            <EnFr
              en={<>
                <p>
                  To pick the right rule, you have to actually play each
                  variant. I ended up testing five small
                  variations on the terminating rule, and for each I
                  built three opponents to set against one
                  another.
                </p>
                <p>
                  The first opponent picks a legal move at random. It's a
                  floor: if a trained network can't beat random, it has
                  learned nothing.
                </p>
                <p>
                  The second is a network that learns by playing itself
                  thousands of times, gradually preferring moves that
                  ended in wins and steering away from those that ended
                  in losses. The third is a stronger version of the same
                  idea — the algorithm DeepMind used to beat the world
                  champions at Go and chess: at every turn the network
                  draws up a short list of plausible continuations and
                  looks a few moves ahead before committing. The
                  combination is meaningfully better than either piece
                  alone.
                </p>
                <p>
                  For each variant, every level played every other level
                  — random against the trained network, the network
                  against its stronger version, and so on. About fifteen
                  thousand games per variant. Three things mattered. Was
                  White's win rate between 45 and 55 % — is the game{" "}
                  <em className="text-paper">balanced</em>? Did the
                  stronger player win at least 75 % of the time against
                  the weaker one — does{" "}
                  <em className="text-paper">skill</em> matter? And when
                  draws happened, were they between players of comparable
                  strength (earned) or between unequal ones (suspicious)?
                </p>
                <p>
                  The five variants tested are below. The verdict follows.
                </p>
              </>}
              fr={<>
                <p>
                  Pour choisir la bonne règle, il faut effectivement jouer
                  chaque variante. J'ai fini par tester cinq petites
                  variations autour de la règle de fin, et pour chacune j'ai
                  construit trois adversaires à opposer entre eux.
                </p>
                <p>
                  Le premier adversaire pioche un coup légal au hasard.
                  C'est un plancher : si un réseau entraîné ne le bat pas,
                  c'est qu'il n'a rien appris.
                </p>
                <p>
                  Le deuxième est un réseau qui apprend en jouant contre
                  lui-même, des milliers de fois, en glissant peu à peu
                  ses préférences vers les coups qui ont fini par gagner
                  et en s'éloignant de ceux qui ont fini par perdre. Le
                  troisième est une version plus ambitieuse de la même
                  idée — l'algorithme avec lequel DeepMind a battu les
                  champions du monde au Go et aux échecs : à chaque tour,
                  le réseau dresse une courte liste de suites plausibles
                  et en regarde quelques-unes en avance avant de jouer.
                  La combinaison est nettement meilleure que chaque pièce
                  prise séparément.
                </p>
                <p>
                  Pour chaque variante, chaque niveau a affronté tous les
                  autres — aléatoire contre le réseau entraîné, le réseau
                  contre sa version plus ambitieuse, et ainsi de suite.
                  Environ quinze mille parties par variante. Trois choses
                  comptaient. Le taux de victoire du Blanc tombait-il
                  entre 45 et 55 % — le jeu est-il{" "}
                  <em className="text-paper">équilibré</em> ? Le joueur
                  le plus fort battait-il le plus faible au moins 75 % du
                  temps — la{" "}
                  <em className="text-paper">hiérarchie</em> joue-t-elle
                  son rôle ? Et quand il y avait des nuls, tombaient-ils
                  entre joueurs de niveau comparable (mérités) ou entre
                  joueurs inégaux (suspects) ?
                </p>
                <p>
                  Les cinq variantes testées sont ci-dessous. Le verdict
                  suit.
                </p>
              </>}
            />
          </div>
        </div>

        <aside className="hidden lg:flex flex-col gap-6 mt-2 mono text-[11px] tracking-[0.18em] uppercase text-paper-3">
          <div className="flex flex-col gap-1 pl-4 border-l border-vermilion">
            <span className="display-italic text-vermilion text-4xl tracking-normal normal-case">5</span>
            <span>{lang === "fr" ? "variantes testées" : "variants tested"}</span>
          </div>
          <div className="flex flex-col gap-1 pl-4 border-l border-hair">
            <span className="display-italic text-paper-2 text-3xl tracking-normal normal-case">3</span>
            <span>{lang === "fr" ? "niveaux par variante" : "levels per variant"}</span>
          </div>
          <div className="flex flex-col gap-1 pl-4 border-l border-hair">
            <span className="display-italic text-paper-2 text-3xl tracking-normal normal-case">~15&nbsp;000</span>
            <span>{lang === "fr" ? "parties par variante" : "games per variant"}</span>
          </div>
          <div className="flex flex-col gap-1 pl-4 border-l border-vermilion">
            <span className="display-italic text-vermilion text-3xl tracking-normal normal-case">1</span>
            <span>{lang === "fr" ? "qui passe les trois critères" : "passes all three checks"}</span>
          </div>
        </aside>
        </div>

        <div className="relative">
          <TournamentArcs count={VARIANTS.length} />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 md:gap-5 relative z-10">
            {VARIANTS.map((v, i) => <VariantCard key={v.id} variant={v} index={i} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Vermilion arcs above the variant cards — each pair connected by a
 *  curved bracket suggesting a round-robin tournament. Arcs fade in
 *  after the cards settle. Hidden on small screens (cards stack). */
function TournamentArcs({ count }: { count: number }) {
  // x position of each card's top center, in 0..100 viewBox units
  const nodes = Array.from({ length: count }, (_, i) => 5 + (i + 0.5) * (90 / count));
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) pairs.push([i, j]);
  }
  // Each pair gets an arc whose height is proportional to the distance —
  // longer pairs arc higher, like a fan over the row of cards.
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="hidden md:block absolute left-0 right-0 w-full pointer-events-none"
      style={{ height: 80, top: -56 }}
    >
      {pairs.map(([a, b], idx) => {
        const xa = nodes[a]!;
        const xb = nodes[b]!;
        const dx = Math.abs(xb - xa);
        // higher arc for longer pairs; clamp so closest pairs aren't flat
        const peakY = Math.max(2, 28 - dx * 1.0);
        const midX = (xa + xb) / 2;
        const path = `M ${xa} 28 Q ${midX} ${peakY} ${xb} 28`;
        return (
          <motion.path
            key={idx}
            d={path}
            fill="none"
            stroke="rgba(217,79,44,0.55)"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-5%" }}
            transition={{
              delay: 0.9 + idx * 0.06,
              duration: 0.7,
              ease: [0.22, 0.6, 0.2, 1],
            }}
          />
        );
      })}
      {/* tiny vermilion dots at each card's anchor */}
      {nodes.map((x, i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={28}
          r={0.4}
          fill="var(--color-vermilion)"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: "-5%" }}
          transition={{ delay: 0.7 + i * 0.05, duration: 0.3, type: "spring", stiffness: 280 }}
        />
      ))}
    </svg>
  );
}

function VariantCard({
  variant,
  index,
}: {
  variant: (typeof VARIANTS)[number];
  index: number;
}) {
  const { lang } = useLang();
  const i18n = STRINGS.variants[variant.id as keyof typeof STRINGS.variants];
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: "-5%" }}
      transition={{ delay: index * 0.09, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="relative flex flex-col gap-4 border border-hair bg-ink-2 p-4 md:p-5 rounded-sm cursor-default group"
      style={{
        transformOrigin: "center bottom",
        boxShadow: "0 24px 40px -28px rgba(0,0,0,0.6)",
      }}
    >
      {/* a thin vermilion edge line that grows from left on hover */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px] bg-vermilion origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-500 ease-out"
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.25em] uppercase text-vermilion">
          {variant.id}
        </span>
        <span className="display italic text-2xl text-paper-3 group-hover:text-vermilion transition-colors">
          {variant.glyph}
        </span>
      </div>
      <div className="display text-xl md:text-2xl text-paper leading-tight">
        {i18n ? i18n.label[lang] : variant.label}
      </div>
      <div className="flex justify-center py-2">
        <StoryBoard board={variant.board} size="mini" showCoords={false} />
      </div>
      <p className="mono text-[11px] leading-[1.55] text-paper-2">
        {i18n ? i18n.rule[lang] : variant.rule}
      </p>
    </motion.div>
  );
}

/* ---------------- scene 8: the verdict ---------------- */

function Scene8Verdict() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <section id="chapter-ix" className="relative py-28 md:py-40 px-6 md:px-10 border-t border-hair">
      <div className="mx-auto max-w-6xl space-y-14">
        <div ref={ref} className="reveal space-y-6 max-w-[58ch]">
          <SectionChapterHead numeral={CHAPTER_NUMERAL.IX} kicker={STRINGS.chapters.IX[lang]} />
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)] text-paper leading-[1.08] text-balance">
            {STRINGS.scene8.h2A[lang]}
            <span className="display-italic text-vermilion">{STRINGS.scene8.h2B[lang]}</span>
            {STRINGS.scene8.h2C[lang]}
          </h2>
          <p className="text-paper-2">{STRINGS.scene8.intro[lang]}</p>
        </div>

        <VerdictTable />

        <div className="grid md:grid-cols-2 gap-10 pt-8 border-t border-hair text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
          <div className="space-y-4">
            <p className="text-paper max-w-prose">
              <span className="display-italic text-2xl text-vermilion">
                {STRINGS.variants["LC1-2"].label[lang]}
              </span>
              {" "}
              {lang === "en"
                ? STRINGS.verdict.suddenDeath.paraEn.replace(/^Sudden Death\s+/, "")
                : STRINGS.verdict.suddenDeath.paraFr.replace(/^Mort subite\s+/, "")}
            </p>
            <p className="text-paper-3 mono text-[11px]">
              {STRINGS.verdict.suddenDeath.tag[lang]}
            </p>
          </div>
          <div className="space-y-4">
            <p className="text-paper max-w-prose">
              <span className="display-italic text-2xl text-vermilion">
                {STRINGS.verdict.labels["LC3-29"][lang]}
              </span>
              {" "}
              {lang === "en"
                ? STRINGS.verdict.classic.paraEn.replace(/^Classic · 29\s+/, "")
                : STRINGS.verdict.classic.paraFr.replace(/^Classique · 29\s+/, "")}
            </p>
            <p className="text-paper-3 mono text-[11px]">
              {STRINGS.verdict.classic.tag[lang]}
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-hair text-[1.0625rem] md:text-[1.125rem] leading-[1.75] text-paper-2 max-w-[60ch]">
          <EnFr
            en={<p>
              Of the three variants that didn't survive, the most
              instructive failure was the one with a hard move cap and no
              tie-breaker. Under that rule the game is secretly decided
              by parity: whoever has to move on the capping turn loses,
              so whichever colour's parity matches the cap wins regardless
              of play. The trained network took an afternoon to figure
              that out. After which it stopped playing the game and
              started playing with the counter — a useful reminder that a
              rule which lets a learner converge on a counting trick
              isn't really a rule about the board.
            </p>}
            fr={<p>
              Des trois variantes qui n'ont pas survécu, l'échec le plus
              instructif était celle au plafond strict, sans départage.
              Sous cette règle, la partie est décidée en secret par la
              parité : celui qui doit jouer au coup de plafond perd, donc
              la couleur dont la parité tombe juste gagne, quelle que
              soit la qualité du jeu. Le réseau entraîné a mis un
              après-midi à le comprendre. Après quoi il a cessé de jouer
              au jeu, et a joué avec le compteur — un rappel utile : une
              règle où l'apprenant peut converger sur une astuce de
              comptage n'est plus, à proprement parler, une règle qui
              parle du plateau.
            </p>}
          />
        </div>
      </div>
    </section>
  );
}

function VerdictTable() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  const headers = STRINGS.scene8.tableHeaders;
  // sort: winners first, then warns, then fails — visual priority of the
  // "podium" reading.
  const sorted = [...VERDICT].sort((a, b) => {
    const order = { pass: 0, warn: 1, fail: 2 } as const;
    return order[a.verdict as keyof typeof order] - order[b.verdict as keyof typeof order];
  });
  return (
    <div ref={ref} className="reveal delay-1 relative">
      {/* dot-matrix paper frame: tractor-feed sprocket holes on either
          side, a printer-style header bar above. The frame is decorative
          — the table inside is unchanged — but it tells the eye this is
          *output*, the printed verdict of a real machine. */}
      <SprocketColumn side="left" />
      <SprocketColumn side="right" />
      <div className="mx-7 md:mx-10 border-x border-dashed border-hair">
        <div className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 px-4 py-2 border-b border-dashed border-hair flex items-center justify-between">
          <span>
            {lang === "en" ? "tournament.out · page 1 of 1" : "tournoi.out · page 1 sur 1"}
          </span>
          <span className="text-paper-3">
            {lang === "en" ? "5 variants · 15,000 games" : "5 variantes · 15 000 parties"}
          </span>
        </div>
        <div className="overflow-x-auto px-4 py-2">
          <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            {(["variant", "balance", "skill", "draws", "verdict"] as const).map((h) => (
              <th key={h} className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 pb-4 border-b border-hair">
                {headers[h][lang]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const balanceOk = Math.abs(row.balance - 0.5) <= 0.05;
            const skillOk = row.skill >= 0.75;
            const labelI18n = STRINGS.verdict.labels[row.id as keyof typeof STRINGS.verdict.labels];
            const failI18n = STRINGS.verdict.failReasons[row.id as keyof typeof STRINGS.verdict.failReasons];
            const failed = row.verdict === "fail";
            return (
              <motion.tr
                key={row.id}
                {...fadeRight}
                initial={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.55, ease: "easeOut", delay: i * 0.08 }}
                className={`align-middle border-b border-hair relative ${
                  row.winner
                    ? "bg-vermilion/[0.06]"
                    : failed
                    ? "opacity-60"
                    : ""
                }`}
              >
                <td className="py-5 pr-4">
                  <div className="flex items-baseline gap-3">
                    {row.winner && (
                      <motion.span
                        className="display italic text-vermilion text-2xl"
                        initial={{ scale: 0, rotate: -45 }}
                        whileInView={{ scale: 1, rotate: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08 + 0.4, type: "spring", stiffness: 280, damping: 18 }}
                      >
                        ★
                      </motion.span>
                    )}
                    <div>
                      <div className={`display text-lg ${row.winner ? "text-paper font-semibold" : "text-paper"} ${failed ? "line-through decoration-vermilion/60" : ""}`}>
                        {labelI18n ? labelI18n[lang] : row.label}
                      </div>
                      <div className="mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
                        {row.id}
                      </div>
                    </div>
                  </div>
                </td>
                <MetricCell value={row.balance} ok={balanceOk} />
                <MetricCell value={row.skill} ok={skillOk} />
                <MetricCell value={row.draws} ok={row.draws <= 0.1} />
                <td className="py-5 pl-4">
                  <VerdictBadge verdict={row.verdict as "pass" | "fail" | "warn"} />
                  {row.failReason && (
                    <div className="mono text-[10px] text-paper-3 mt-1 max-w-[18ch]">
                      {failI18n ? failI18n[lang] : row.failReason}
                    </div>
                  )}
                </td>
              </motion.tr>
            );
          })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

/** Continuous-feed paper sprocket holes — two columns of small dots
 *  flanking the verdict table to suggest dot-matrix printer output. */
function SprocketColumn({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      className={`absolute top-0 bottom-0 w-7 md:w-10 flex flex-col items-center justify-evenly ${
        side === "left" ? "left-0" : "right-0"
      }`}
    >
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: "var(--color-hair)",
            border: "1px solid var(--color-graphite)",
          }}
        />
      ))}
    </div>
  );
}

function MetricCell({ value, ok }: { value: number; ok: boolean }) {
  const pct = value * 100;
  return (
    <td className="py-5 pr-4 min-w-[140px]">
      <div className="flex items-center gap-3">
        <div className="relative h-1.5 flex-1 bg-ink-3 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: ok ? "var(--color-vermilion)" : "var(--color-graphite)",
              transition: "width 1.1s cubic-bezier(0.2,0.65,0.3,1)",
            }}
          />
        </div>
        <span className={`mono text-[12px] tabular-nums ${ok ? "text-paper" : "text-paper-3"}`}>
          {FMT.pct(value, 1)}
        </span>
      </div>
    </td>
  );
}

function VerdictBadge({ verdict }: { verdict: "pass" | "fail" | "warn" }) {
  const { lang } = useLang();
  // PASS uses the act's primary accent (phosphor green in Act II, gold
  // in Act III). FAIL uses the act's "regression" second voice (rust
  // in Act II, navy-soft in Act III). WARN sits between, in the
  // mid-tone paper colour.
  const map = {
    pass: { color: "var(--color-vermilion)", bg: "color-mix(in oklab, var(--color-vermilion) 12%, transparent)" },
    warn: { color: "var(--color-paper-2)",   bg: "color-mix(in oklab, var(--color-paper-2) 6%, transparent)" },
    fail: { color: "var(--color-second)",    bg: "color-mix(in oklab, var(--color-second) 10%, transparent)" },
  };
  const s = map[verdict];
  return (
    <span
      className="mono inline-flex items-center gap-1 text-[10px] tracking-[0.22em] uppercase px-2 py-1 rounded-sm"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}` }}
    >
      {STRINGS.scene8.badges[verdict][lang]}
    </span>
  );
}


/* ---------------- the recovery beat (Act II → III pivot) ----------------

   The arc spends ~260vh and a six-beat slam on the failure. Without a
   counter-beat the recovery reads flat. This is the catharsis: the dead run
   is struck through, the fifty-four-minute rerun resolves up in gold, and the
   page is one scroll from Act III. */
function RecoveryBeat() {
  const { lang } = useLang();
  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
  return (
    <section className="relative py-24 md:py-36 px-6 border-t border-hair overflow-hidden">
      <div className="mx-auto max-w-3xl flex flex-col items-center text-center gap-7">
        {/* the dead run — struck through */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
          className="relative mono uppercase tracking-[0.15em] tabular-nums"
          style={{
            color: "var(--color-second)",
            fontSize: "clamp(0.9rem, 2.1vw, 1.35rem)",
          }}
        >
          49,000,000 {t("entries", "entrées")} · 36&nbsp;GB · {t("killed", "tué")}
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-[2px] origin-left"
            style={{ width: "100%", background: "var(--color-second)" }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.6, 0, 0.2, 1] }}
          />
        </motion.div>

        <motion.span
          aria-hidden
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.95 }}
          className="mono text-lg"
          style={{ color: "var(--color-vermilion)" }}
        >
          ↓
        </motion.span>

        {/* the rerun — resolves up in the act accent */}
        <motion.div
          initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.8, delay: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="display-italic tabular-nums"
          style={{
            color: "var(--color-vermilion)",
            fontSize: "clamp(1.8rem, 5vw, 3.4rem)",
            textShadow:
              "0 0 30px color-mix(in oklab, var(--color-vermilion) 35%, transparent)",
          }}
        >
          54&nbsp;min · 975K {t("positions", "positions")} · {t("finished", "terminé")}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.5, duration: 0.6 }}
          className="text-paper-2 text-[1.0625rem] leading-[1.6] max-w-[42ch]"
        >
          {t(
            "The fix took an afternoon. The rerun took fifty-four minutes. The twelve lost days had only ever been mine to lose.",
            "Le correctif a pris un après-midi ; la reprise, cinquante-quatre minutes. Les douze jours perdus n'auront été qu'à moi.",
          )}
        </motion.p>
      </div>
    </section>
  );
}

/* scene 11 glossary moved to GlossaryConstellation.tsx (interactive graph). */

/* ---------------- scene 10: epilogue ---------------- */

function Scene10Epilogue() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <section id="chapter-xii" className="relative py-32 md:py-48 px-6 md:px-10 border-t border-hair">
      <div ref={ref} className="reveal mx-auto max-w-[60ch] space-y-8">
        <SectionChapterHead numeral={CHAPTER_NUMERAL.XII} kicker={STRINGS.chapters.XII[lang]} />

        {/* The opening position — full circle to where the article began.
            Sits at the top of the final chapter as a visual breath before
            the closing prose. Previously rendered after the CliDownload,
            which left it stranded as a stale board past the article's CTA. */}
        <FinaleFreeze />

        <h2 className="display text-[clamp(2rem,4vw,3rem)] text-paper leading-[1.08] text-balance">
          {STRINGS.scene12.h2A[lang]}
          <span className="display-italic text-vermilion">{STRINGS.scene12.h2B[lang]}</span>
          {STRINGS.scene12.h2C[lang]}
        </h2>

        <div className="space-y-6 text-paper body text-[1.0625rem] leading-[1.75]">
          <EnFr
            en={<>
              <p className="dropcap">
                An AI told me, one day, that a small board
                game had fewer than a million reachable positions. It was
                wrong by a factor of fifty. The first run stockpiled
                forty-nine million entries before the kernel killed it.
                The second run blew up the same way and took everything
                with it. Twelve days of compute, total.
              </p>
              <p>
                The answer was plausible. It matched what I was
                hoping to hear. Neither of us took the ten minutes it
                would have taken to check.
              </p>
              <p>
                The lesson isn't that AIs are untrustworthy. It's that a
                mistake said fluently sounds exactly like a truth said
                fluently — and the only defence against that symmetry is
                to keep, in your own head, a version of the problem
                detailed enough to notice yourself, unaided, when an
                answer is off by an order of magnitude. It isn't a
                technical safeguard. It's a discipline.
              </p>
            </>}
            fr={<>
              <p className="dropcap">
                Une IA m'a dit, un jour, qu'un petit
                jeu de plateau avait moins d'un million de positions
                atteignables. Elle s'est trompée d'un facteur cinquante.
                Le premier run a stocké quarante-neuf millions d'entrées
                avant que le noyau ne le tue. Le second a sauté de la
                même manière, et tout ce qui restait avec. Douze jours
                de calcul en tout.
              </p>
              <p>
                La réponse était plausible. Elle collait à ce que
                j'espérais entendre. Ni l'un ni l'autre n'a pris les dix
                minutes qu'il aurait fallu pour vérifier.
              </p>
              <p>
                La leçon, ce n'est pas que les IA ne sont pas fiables.
                C'est qu'une erreur dite avec aisance sonne exactement
                comme une vérité dite avec aisance — et que la seule
                défense contre cette symétrie, c'est de garder dans
                votre tête une version du problème assez détaillée pour
                repérer vous-même, sans aide, quand une réponse est
                fausse d'un ordre de grandeur. Ce n'est pas une
                protection technique. C'est une discipline.
              </p>
            </>}
          />
          <Callout>
            <EnFr
              en={<>You cannot outsource the part of the thinking that tells you
                whether the thinking is working.</>}
              fr={<>On ne peut pas déléguer la part du raisonnement qui vous dit si le
                raisonnement fonctionne.</>}
            />
          </Callout>
          <EnFr
            en={<>
              <p>
                The rewrite happened after the second loss. The Python
                solver was rewritten in <Term term="Rust">Rust</Term>,
                with cycle detection in the search and checkpoints on
                every long job. The same engine now drives the network's
                training and the browser tab you're reading in, so there
                is no possible drift between what the network learned
                and what you can play against. The rule itself was
                treated as an experimental variable, not a given. What
                came out is a smaller, honest game: it ends, skill wins,
                draws are earned.
              </p>
              <p>
                The code is open. The solver, the training pipeline, the
                variants and their tournament logs, the network and the
                bridge that runs it client-side — all of it lives in one
                Rust workspace you can clone and run. The
                best way to trust a computation is still to do it
                yourself.
              </p>
            </>}
            fr={<>
              <p>
                La réécriture a eu lieu après le second échec. Le
                solveur Python a été repris en{" "}
                <Term term="Rust">Rust</Term>, avec détection de cycle
                dans la recherche et points de sauvegarde à chaque long
                calcul. Le même moteur alimente l'entraînement du réseau
                et l'onglet du navigateur dans lequel vous lisez, sans
                dérive possible entre ce que le réseau a appris et ce
                que vous pouvez affronter. La règle elle-même a été
                traitée comme variable d'expérience, non plus comme
                donnée. Ce qui en est sorti est un jeu plus petit, plus
                honnête : il se termine, le meilleur l'emporte, les nuls
                sont mérités.
              </p>
              <p>
                Le code est ouvert. Le solveur, le pipeline
                d'entraînement, les variantes et leurs logs de tournoi,
                le réseau et le pont qui le fait tourner côté client —
                tout tient dans un seul espace de travail Rust qu'il
                vous suffit de cloner et de lancer. La meilleure manière
                de faire confiance à un calcul, c'est encore de le
                refaire soi-même.
              </p>
            </>}
          />
          <CliDownload />

          <p className="mono text-[13px] text-paper-3 pt-4 border-t border-hair">
            {STRINGS.hero.signOff[lang]}
          </p>
        </div>
      </div>
    </section>
  );
}

/** A small box at the end of the article inviting the reader to run
 *  the CLI version of the game on their terminal. The same engine
 *  drives the browser version above, so the CLI is the same game with
 *  a different surface.
 *
 *  Linked to the project's GitHub releases page; the build-from-source
 *  fallback is live today even if no binary release has been cut yet. */
function CliDownload() {
  const { lang } = useLang();
  const REPO = "https://github.com/w2ur/pogofish";
  return (
    <div className="mt-2 mb-2 border border-hair border-l-2 border-l-vermilion p-5 md:p-6 bg-ink-2/40 space-y-3">
      <div className="mono text-[10px] tracking-[0.32em] uppercase text-vermilion">
        {lang === "fr" ? "Le jeu, version terminal" : "The game, on your terminal"}
      </div>
      <p className="text-paper text-[1rem] leading-[1.6]">
        {lang === "fr"
          ? "Pogofish embarque un jeu en mode terminal — même moteur Rust que la version navigateur ci-dessus, interface curses, contrôles au clavier."
          : "Pogofish ships a curses-style terminal game — the same Rust engine as the browser version above, keyboard controls, no GUI."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <a
          href={`${REPO}/releases/latest`}
          className="inline-flex items-center gap-2 px-4 py-2 border border-vermilion text-vermilion mono text-[11px] tracking-[0.2em] uppercase hover:bg-vermilion hover:text-ink transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          ▼ {lang === "fr" ? "Télécharger le binaire" : "Download the binary"}
        </a>
        <a
          href={`${REPO}#cli-game`}
          className="inline-flex items-center gap-2 px-4 py-2 border border-hair text-paper-2 mono text-[11px] tracking-[0.2em] uppercase hover:border-paper-2 hover:text-paper transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          ⌥ {lang === "fr" ? "Compiler depuis la source" : "Build from source"}
        </a>
      </div>
      <p className="mono text-[10px] text-paper-3 leading-[1.5] pt-1">
        {lang === "fr"
          ? "macOS et Linux. Touches : flèches pour naviguer, Entrée pour sélectionner, 1/2/3 pour la taille de pile, q pour quitter."
          : "macOS and Linux. Keys: arrows to navigate, Enter to select, 1/2/3 for stack size, q to quit."}
      </p>
    </div>
  );
}

/** Closing freeze-frame: the board returns to the opening position, all
 *  twelve chapter numerals scattered around it like constellation stars,
 *  rotating slowly. The article's last image. */
function FinaleFreeze() {
  return (
    <div className="relative mb-6 mx-auto" style={{ height: "min(48vh, 360px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          className="relative"
          style={{ width: "min(36vmin, 320px)", height: "min(36vmin, 320px)" }}
        >
          <FinaleBoard />
        </div>
      </motion.div>
    </div>
  );
}

function FinaleBoard() {
  // Frame 0 — the opening position. Full circle to where we started.
  return (
    <FinaleSvgBoard
      frameIdx={0}
      mode="standard"
      glow={0.5}
      instant
      className="w-full h-full"
    />
  );
}
