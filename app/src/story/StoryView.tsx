import { useEffect, useState } from "react";
import { StoryBoard } from "./StoryBoard";
import { Term } from "./Term";
import { TryYourself } from "./TryYourself";
import { PlayScene } from "./PlayScene";
import { PlayCTA } from "./PlayCTA";
import { LearningsScene } from "./LearningsScene";
import { useReveal, useActiveIndex } from "./useReveal";
import {
  HERO_SEQUENCE,
  PINNED_BOARDS,
  PINNED_LABELS,
  CHAPTERS,
  VARIANTS,
  FAILED_RUN_DAYS,
  VERDICT,
  GLOSSARY,
  FMT,
} from "./data";

export function StoryView() {
  return (
    <div className="story story-grain story-noise min-h-screen">
      <StoryChrome />
      <Scene1Hook />
      <TryYourself />
      <PinnedStory />
      <Scene7Experiments />
      <Scene8Verdict />
      <PlayScene />
      <LearningsScene />
      <Scene10Epilogue />
      <Scene11Glossary />
      <StoryFooter />
      <PlayCTA />
    </div>
  );
}

/* ---------------- chrome ---------------- */

function StoryChrome() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 md:px-10 md:py-5 pointer-events-none"
      style={{
        background:
          "linear-gradient(180deg, rgba(18,16,14,0.92) 0%, rgba(18,16,14,0.6) 60%, rgba(18,16,14,0) 100%)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div className="pointer-events-auto flex items-baseline gap-3 text-paper">
        <span className="display italic text-[22px] tracking-tight">pogofish</span>
        <span className="mono text-[9px] tracking-[0.3em] uppercase text-paper-3 hidden sm:inline">
          &middot; a rewrite
        </span>
      </div>
      <a
        href="#play"
        className="pointer-events-auto mono text-[10px] tracking-[0.25em] uppercase text-paper-3 hover:text-vermilion transition-colors"
      >
        skip to play &rarr;
      </a>
    </header>
  );
}

function StoryFooter() {
  return (
    <footer className="relative z-10 border-t border-hair px-6 py-10 mt-24">
      <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <div className="display italic text-2xl">pogofish</div>
          <div className="mono text-[10px] tracking-[0.28em] uppercase text-paper-3">
            a board game &middot; a misplaced trust &middot; a rewrite
          </div>
        </div>
        <div className="mono text-[11px] text-paper-3 max-w-xs">
          Made with care by{" "}
          <a href="https://william.revah.paris" className="text-paper hover:text-vermilion underline underline-offset-4">
            William
          </a>
          .
        </div>
      </div>
    </footer>
  );
}

/* ---------------- scene 1: hook ---------------- */

function Scene1Hook() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % HERO_SEQUENCE.length);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const current = HERO_SEQUENCE[frame] ?? HERO_SEQUENCE[0]!;

  return (
    <section className="relative flex min-h-screen w-full flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 35%, rgba(217,79,44,0.10), transparent 75%)",
        }}
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-10 lg:gap-16">
        <div className="order-2 lg:order-1 text-left lg:text-right space-y-6">
          <div className="kicker">{CHAPTERS[0]!.numeral} &middot; {CHAPTERS[0]!.kicker}</div>
          <h1 className="display text-[clamp(2.6rem,6.5vw,5.2rem)] text-paper">
            Does the first&nbsp;player{" "}
            <span className="display-italic text-vermilion">win</span> at Pogo?
          </h1>
          <p className="body text-paper-2 max-w-md lg:ml-auto">
            A question I could not answer with a minimax solver. A rewrite that turned
            into a story about trusting an AI with a calculation I should have done
            myself.
          </p>
        </div>

        <div className="order-1 lg:order-2 relative">
          <div className="relative" style={{ animation: "fade-in 1.4s ease-out both" }}>
            <StoryBoard board={current} size="large" showCoords={false} />
            <div
              aria-hidden
              className="absolute -inset-8 rounded-2xl pointer-events-none"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 50%, rgba(217,79,44,0.10), transparent 70%)",
                animation: "piece-breathe 5s ease-in-out infinite",
              }}
            />
          </div>
          <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
            {HERO_SEQUENCE.map((_, i) => (
              <span
                key={i}
                className="h-[2px] transition-all duration-500"
                style={{
                  width: i === frame ? 22 : 8,
                  background: i === frame ? "var(--color-vermilion)" : "var(--color-graphite)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="order-3 hidden lg:block" aria-hidden />
      </div>

      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 mono text-[10px] tracking-[0.35em] uppercase text-paper-3 flex flex-col items-center gap-2"
      >
        <span>scroll</span>
        <span className="h-8 w-px bg-paper-3 opacity-60" />
      </div>
    </section>
  );
}

/* ---------------- scenes 2–6: pinned sidecar ---------------- */

function PinnedStory() {
  const { refs, active } = useActiveIndex(5);
  const board = PINNED_BOARDS[active] ?? PINNED_BOARDS[0]!;
  const pinLabel = PINNED_LABELS[active] ?? PINNED_LABELS[0]!;

  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[minmax(280px,_340px)_minmax(0,_1fr)] gap-10 lg:gap-20">
        {/* sticky board column */}
        <aside className="hidden lg:block">
          <div className="sticky top-0 h-screen flex flex-col items-center justify-center gap-6">
            <div className="kicker">Position {active + 1} of 5</div>
            <StoryBoard
              key={active}
              board={board}
              size="default"
              showCoords
              style={{ animation: "fade-in 0.9s ease both" }}
            />
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-paper-3">
              {pinLabel}
            </div>
          </div>
        </aside>

        <div className="flex flex-col">
          {/* II — a game I found */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[0] = el; }}
            chapter={CHAPTERS[1]!.numeral}
            kicker={CHAPTERS[1]!.kicker}
          >
            <p className="dropcap">
              Pogo is a real board game. I did not invent it; I found it on a shelf in
              a friend's flat, sat through one round, and then lay awake that night
              turning it over in my head. Three rows by three columns. Twelve pieces.
              A single rule for how stacks of pieces travel. No dice, no cards, no
              hidden information. A game you could fit, piece by piece, into your
              head.
            </p>
            <p>
              The rule is almost insultingly simple. Pick up a tower of one, two, or
              three pieces from a cell where your colour is on top. Move it in a
              straight line whose length is <Term term="Manhattan distance">determined
              by the count</Term> &mdash; one piece travels one cell, two pieces travel
              two, three pieces travel one or three. Drop the tower on top of
              whatever is already on the target cell. Repeat until the losing
              condition fires. The game fits on a napkin.
            </p>
            <p>
              That napkin was what made it look like a good problem for a small
              experiment. I had been reading about <Term term="RL">reinforcement
              learning</Term> and wanted to train an agent on something I could verify
              by brute force. Pogo looked perfect: small enough to solve exactly with
              <Term term="Minimax"> minimax</Term>, small enough to run self-play in
              a corner of a laptop, and novel enough that no public code would leak
              into training.
            </p>
            <p>
              The experiment I pictured was a neat parallel run. Build the solver,
              compute the true value of every reachable state, then train a neural
              network and measure how quickly it caught up. A thesis-sized question
              on a kitchen-table board. I started, as I often do, by asking an AI how
              big the problem was.
            </p>
          </NarrativePanel>

          {/* III — the confident AI */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[1] = el; }}
            chapter={CHAPTERS[2]!.numeral}
            kicker={CHAPTERS[2]!.kicker}
          >
            <p>
              Before writing a single line, I had a conversation with a chat model
              about the shape of the game tree. I wanted to know the number of
              reachable positions &mdash; a rough answer was enough. If it was in the
              millions, a minimax solver with a{" "}
              <Term term="Transposition table">transposition table</Term> would
              fit on my laptop. If it was in the billions, I needed a different plan.
            </p>
            <TranscriptCard
              header="claude &middot; session 0 &middot; 2026-03-19"
              body={
                <>
                  <span className="text-paper-3">&gt; how many reachable states?</span>
                  <br />
                  no more than <span className="text-vermilion">≈ 1,000,000</span>. easy
                  solve — a few hours, single-threaded.
                </>
              }
            />
            <p>
              A million states is small. Small enough that{" "}
              <Term term="Alpha-beta pruning">alpha-beta pruning</Term> would chew
              through it over lunch. I did the mental sanity-check: nine cells, up to
              twelve pieces per cell, two possible colours per slot. A very rough
              ceiling of 2¹² × 9ʳ positions if you squint. Yes, several million.
              Sure, maybe a bit more. Nowhere close to a problem.
            </p>
            <p>
              I accepted the number and started building. The model had not hedged,
              and I had not pushed. It is possible to read that exchange now as two
              collaborators skipping a step together, each one assuming the other had
              done the arithmetic. The step we skipped was the one that mattered:
              asking whether the game actually <em className="text-paper">ends</em>.
            </p>
            <AnnotatedCompare
              claimed="1,000,000"
              actual="49,000,000+"
              claimedLabel="claimed"
              actualLabel="actually reachable, lower bound"
            />
            <p>
              The true number is at least fifty times larger, and that is only
              counting states my solver reached before it ran out of memory. The real
              state space, under the game's original rules, has no upper bound at all
              &mdash; which is a different problem from being big.
            </p>
          </NarrativePanel>

          {/* IV — six days */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[2] = el; }}
            chapter={CHAPTERS[3]!.numeral}
            kicker={CHAPTERS[3]!.kicker}
          >
            <p>
              I wrote the solver in a weekend. Alpha-beta search. A{" "}
              <Term term="Transposition table">transposition table</Term> keyed on the
              canonical form of a position so symmetric board states would collapse
              into the same entry. A small perfect-hash for stacks. Iterative
              deepening so partial results were always usable if I killed the
              process. It ran. It scored positions. I left it running over the
              weekend and went climbing.
            </p>
            <p>
              Day one looked fine. The transposition table grew quickly, but it grew
              the way these tables do &mdash; logarithmically feels right, because most
              new states are near-duplicates of ones already seen. Day two looked
              slower but plausible. On day three it was obvious that the log curve I
              had been imagining was linear at best. Day five it was clearly
              superlinear. Day six the process was killed by the kernel.
            </p>
            <SixDaysChart />
            <p>
              Forty-nine million states in the transposition table. Thirty-six
              gigabytes of resident memory. No return value. No checkpoint written to
              disk &mdash; something I had decided to add later, which is another way of
              saying never. Six days of compute had produced exactly nothing: not a
              partial answer, not a bound, not even a proof that the problem was too
              big to solve this way. Just an empty log file and a cold fan.
            </p>
            <p>
              The honest reaction was a long silence and a cup of coffee. The second,
              slightly later reaction was a realisation I should have had on the
              napkin: the tree had no leaves.
            </p>
          </NarrativePanel>

          {/* V — the tree had no leaves */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[3] = el; }}
            chapter={CHAPTERS[4]!.numeral}
            kicker={CHAPTERS[4]!.kicker}
          >
            <p>
              Minimax is a search algorithm with a strict requirement: every branch
              of the tree must eventually end. At the leaves it reads off a verdict
              &mdash; <em className="text-paper">White wins</em>, <em className="text-paper">Red
              wins</em>, <em className="text-paper">draw</em> &mdash; and propagates the
              verdict upward by alternating minimum and maximum operations. Without
              leaves the algorithm has nothing to back up. The machine spins on
              whatever depth horizon you give it, and that horizon is arbitrary.
            </p>
            <p>
              Pogo, as I had encoded it, had no natural way to end. Two careful
              players could keep shuffling pieces between the same three cells
              forever. No rule punished stalling. No rule forbade repetition. The
              only termination condition I had — &ldquo;a tower of all six of one colour&rdquo; —
              was something skilled players could usually avoid creating.
            </p>
            <TreeDiagram />
            <p>
              So the solver was doing honest work on a dishonest problem. It was
              searching an infinite tree, and every time a cycle came back around I
              was paying full price to store the position again under a different
              path. The transposition table, which in most games saves you from that
              exact mistake, was being defeated by the fact that I was folding the
              same state into it along dozens of routes.
            </p>
            <p>
              When I dropped an artificial cap on search depth, the solver stopped
              dying but started lying: the values it returned were about a finite
              proxy problem, not Pogo. I had been drawing a finite tree on the
              napkin. The machine had been patiently solving the only tree it could
              see, with a horizon line pretending to be the ground.
            </p>
          </NarrativePanel>

          {/* VI — the rules became the variable */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[4] = el; }}
            chapter={CHAPTERS[5]!.numeral}
            kicker={CHAPTERS[5]!.kicker}
          >
            <p>
              There was a second problem underneath the first. Even in the finite
              games that did end — the ones where someone stacked all six of their
              colour — the play patterns leading to those endings were strange.
              Stronger players learned to avoid forming towers at all. Pieces would
              distribute themselves into mixed stacks across the middle row and sit
              there, neither side willing to commit. The game would drift toward
              what I started calling a{" "}
              <Term term="Lazy equilibrium">lazy equilibrium</Term>: a position
              stable enough that neither player had anything to gain by moving first.
            </p>
            <p>
              It took me longer than it should have to accept what this meant. Pogo,
              in its honest form, is a game nobody wins. The rules produce no
              pressure to resolve, and a skilled pair can keep the state evolving
              without anyone ever being forced into a losing commitment. For a
              research project this was a dead end; for a player this was, frankly,
              a boring game.
            </p>
            <p>
              The rewrite began here. Instead of trying to solve Pogo I started
              asking what minimum repair would make it a game that could actually
              be solved and played. A losing condition, something that fires when
              the state is cycling or when the budget of moves runs out, and that is
              tight enough that good play is forced to commit. Not a patch stapled
              onto the board — a variable to test. Three families of candidates came
              out of an afternoon with a notebook.
            </p>
            <PullQuote>
              Somebody, eventually, has to lose.
            </PullQuote>
            <p>
              The first family, <strong className="text-paper">LC1</strong>, is
              repetition. If the same position reappears for the Nth time, the
              player to move loses. The second, <strong className="text-paper">LC2</strong>,
              is a hard cap on the number of half-moves: if neither side has ended
              the game by move N, the player whose turn it is loses. The third,{" "}
              <strong className="text-paper">LC3</strong>, is the same cap but with a
              tower-count tiebreaker and an honest draw when the counts are equal.
            </p>
            <p>
              Each family has parameters — how many repetitions, how many moves, how
              many towers — and each combination is a distinct game. Fifteen games,
              in the end. A whole afternoon's worth of experiments, and a question
              sharper than the one I had started with: not &ldquo;is Pogo solvable?&rdquo;,
              but &ldquo;which of these fifteen slightly-different games is actually
              worth playing?&rdquo;
            </p>
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
};

function NarrativePanel({ chapter, kicker, children, sectionRef }: PanelProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={sectionRef} className="min-h-screen flex items-center py-28">
      <div ref={ref} className="reveal space-y-6 w-full max-w-[58ch]">
        <div className="flex items-baseline gap-4">
          <span className="display italic text-3xl md:text-4xl text-vermilion leading-none">
            {chapter}
          </span>
          <span className="fade-line is-visible flex-1 origin-left" />
        </div>
        <div className="kicker">{kicker}</div>
        <div className="space-y-5 text-paper text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
          {children}
        </div>
      </div>
    </section>
  );
}

function TranscriptCard({ header, body }: { header: string; body: React.ReactNode }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal delay-1 border border-hair bg-ink-2 rounded-sm px-5 py-4 my-8 relative"
    >
      <div aria-hidden className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-vermilion" />
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3 mb-3">
        {header}
      </div>
      <div className="mono text-[13px] text-paper-2 leading-[1.7]">{body}</div>
    </div>
  );
}

function AnnotatedCompare({
  claimed,
  actual,
  claimedLabel,
  actualLabel,
}: {
  claimed: string;
  actual: string;
  claimedLabel: string;
  actualLabel: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal delay-2 my-10 grid grid-cols-2 gap-8 border-t border-b border-hair py-8"
    >
      <div>
        <div className="kicker mb-2" style={{ color: "var(--color-paper-3)" }}>{claimedLabel}</div>
        <div className="display text-[clamp(2rem,4vw,3rem)] text-paper-3 line-through decoration-vermilion decoration-2">
          {claimed}
        </div>
      </div>
      <div>
        <div className="kicker mb-2">{actualLabel}</div>
        <div className="display text-[clamp(2rem,4vw,3rem)] text-vermilion">{actual}</div>
      </div>
    </div>
  );
}

function PullQuote({ children }: { children: React.ReactNode }) {
  const ref = useReveal<HTMLQuoteElement>();
  return (
    <blockquote ref={ref} className="reveal delay-1 my-10 pl-5 border-l-2 border-vermilion">
      <span className="pullquote">{children}</span>
    </blockquote>
  );
}

/* ---------------- scene 4 chart ---------------- */

function SixDaysChart() {
  const ref = useReveal<HTMLDivElement>();
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

  return (
    <div ref={ref} className="reveal delay-1 my-8 border border-hair bg-ink-2 rounded-sm p-5">
      <div className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 mb-4 flex justify-between">
        <span>states visited</span>
        <span className="text-vermilion">OOM &middot; day 6</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d94f2c" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#d94f2c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={padX}
            x2={width - padX}
            y1={padY + r * (height - 2 * padY)}
            y2={padY + r * (height - 2 * padY)}
            stroke="#2a2420"
            strokeDasharray="2 4"
          />
        ))}
        <path d={area} fill="url(#area-grad)" />
        <path
          d={path}
          fill="none"
          stroke="#d94f2c"
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
              fill={i === pts.length - 1 ? "#d94f2c" : "#ece2cb"}
              opacity="0"
              style={{ animation: `fade-in 0.6s ${0.6 + i * 0.18}s forwards` }}
            />
            <text x={p.x} y={height - 6} fontSize="10" textAnchor="middle" fill="#8d8472" fontFamily="JetBrains Mono, monospace">
              d{p.day}
            </text>
          </g>
        ))}
        <line
          x1={last.x}
          y1={padY}
          x2={last.x}
          y2={height - padY}
          stroke="#d94f2c"
          strokeWidth="0.6"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      </svg>
      <div className="mt-3 flex justify-between mono text-[11px] text-paper-2">
        <span>0</span>
        <span>
          peak <span className="text-vermilion">{FMT.compact(max)}</span> states &middot; 36&nbsp;GB RAM
        </span>
      </div>
      <style>{`@keyframes dash { to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}

/* ---------------- scene 5 tree diagram ---------------- */

function TreeDiagram() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal delay-1 my-10 grid grid-cols-2 gap-8 border-t border-b border-hair py-6">
      <div className="space-y-3">
        <div className="kicker" style={{ color: "var(--color-paper-3)" }}>what I drew</div>
        <svg viewBox="0 0 160 120" className="w-full h-auto">
          <g stroke="#ece2cb" strokeWidth="1" fill="none">
            <line x1="80" y1="14" x2="40" y2="46" /><line x1="80" y1="14" x2="120" y2="46" />
            <line x1="40" y1="46" x2="20" y2="78" /><line x1="40" y1="46" x2="60" y2="78" />
            <line x1="120" y1="46" x2="100" y2="78" /><line x1="120" y1="46" x2="140" y2="78" />
            <line x1="20" y1="78" x2="14" y2="106" /><line x1="20" y1="78" x2="26" y2="106" />
            <line x1="60" y1="78" x2="54" y2="106" /><line x1="60" y1="78" x2="66" y2="106" />
            <line x1="100" y1="78" x2="94" y2="106" /><line x1="100" y1="78" x2="106" y2="106" />
            <line x1="140" y1="78" x2="134" y2="106" /><line x1="140" y1="78" x2="146" y2="106" />
          </g>
          <g fill="#ece2cb"><circle cx="80" cy="14" r="3" /></g>
          <g fill="#d94f2c">
            {[14, 26, 54, 66, 94, 106, 134, 146].map((x) => (<circle key={x} cx={x} cy="106" r="2.2" />))}
          </g>
        </svg>
        <div className="mono text-[11px] text-paper-2">finite &middot; ends at leaves</div>
      </div>
      <div className="space-y-3">
        <div className="kicker">what I was solving</div>
        <svg viewBox="0 0 160 120" className="w-full h-auto">
          <g stroke="#ece2cb" strokeWidth="1" fill="none">
            <line x1="80" y1="14" x2="40" y2="46" /><line x1="80" y1="14" x2="120" y2="46" />
            <line x1="40" y1="46" x2="20" y2="78" /><line x1="40" y1="46" x2="60" y2="78" />
            <line x1="120" y1="46" x2="100" y2="78" /><line x1="120" y1="46" x2="140" y2="78" />
            <line x1="20" y1="78" x2="14" y2="110" opacity="0.6" /><line x1="20" y1="78" x2="26" y2="110" opacity="0.6" />
            <line x1="60" y1="78" x2="54" y2="110" opacity="0.6" /><line x1="60" y1="78" x2="66" y2="110" opacity="0.6" />
            <line x1="100" y1="78" x2="94" y2="110" opacity="0.6" /><line x1="100" y1="78" x2="106" y2="110" opacity="0.6" />
            <line x1="140" y1="78" x2="134" y2="110" opacity="0.6" /><line x1="140" y1="78" x2="146" y2="110" opacity="0.6" />
          </g>
          <g fill="#ece2cb"><circle cx="80" cy="14" r="3" /></g>
          <line x1="0" y1="112" x2="160" y2="112" stroke="#d94f2c" strokeDasharray="3 3" strokeWidth="0.8" />
          <text x="80" y="120" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill="#d94f2c">
            artificial horizon
          </text>
        </svg>
        <div className="mono text-[11px] text-vermilion">infinite &middot; cycles below the line</div>
      </div>
    </div>
  );
}

/* ---------------- scene 7: five experiments ---------------- */

function Scene7Experiments() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="relative py-28 md:py-40 px-6 md:px-10">
      <div className="mx-auto max-w-6xl space-y-14">
        <div ref={ref} className="reveal space-y-6 max-w-[58ch]">
          <div className="flex items-baseline gap-4">
            <span className="display italic text-3xl md:text-4xl text-vermilion">
              {CHAPTERS[6]!.numeral}
            </span>
            <span className="fade-line is-visible flex-1 origin-left" />
          </div>
          <div className="kicker">{CHAPTERS[6]!.kicker}</div>
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)] text-paper leading-[1.08]">
            If the rules were the variable, which rule was the{" "}
            <span className="display-italic text-vermilion">good</span> one?
          </h2>
          <div className="space-y-5 text-paper text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
            <p>
              The only way to know was to run the actual experiment. Each candidate
              rule is a different game, and every game needs its own trained
              opponents to judge play quality. Five rules, three skill tiers,
              everything playing everything: roughly fifteen thousand games of Pogo
              per variant before any meaningful number comes out the other end.
            </p>
            <p>
              The three skill tiers are the ones I learned to build, in order, while
              this project was happening. The first is <Term term="RL">random</Term>
              play &mdash; a baseline, a floor, a control. The second is{" "}
              <Term term="DQN">DQN</Term>, a neural network trained by playing
              itself and nudging its move preferences toward whichever moves tended
              to win. The third is <Term term="AlphaZero">AlphaZero</Term>: the same
              idea, but with a network that outputs both a{" "}
              <Term term="Policy / value network">policy and a value</Term> at every
              position and whose moves are chosen by a short{" "}
              <Term term="MCTS">tree search</Term> that uses the network as a
              compass.
            </p>
            <p>
              A <Term term="Gatekeeper">gatekeeper</Term> kept the training honest
              for each variant: new candidate networks only became the new champion
              if they won at least 55 % of a match against the current one. A{" "}
              <Term term="Round robin">round-robin tournament</Term> then pitted
              every tier against every other tier. Three measurements mattered:
              is White's win rate between 45 and 55 % (balance), does the strong
              opponent beat the weak one at least 75 % of the time (skill
              matters), and when draws happen, do they happen between strong
              players against weak ones, or only between equals (earned draws)?
            </p>
            <p>
              The five cards below are the survivors I narrowed the slate to after
              a pilot round. Two in LC1 (the repetition family), one in LC2 (the
              hard cap), two in LC3 (the soft cap with draws). Each card shows a
              characteristic mid-game under that rule; the verdict, which follows,
              is where the tournament data lands.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 md:gap-5">
          {VARIANTS.map((v, i) => <VariantCard key={v.id} variant={v} index={i} />)}
        </div>
      </div>
    </section>
  );
}

function VariantCard({
  variant,
  index,
}: {
  variant: (typeof VARIANTS)[number];
  index: number;
}) {
  const ref = useReveal<HTMLDivElement>({ threshold: 0.2, rootMargin: "0px 0px -5% 0px" });
  return (
    <div
      ref={ref}
      className={`reveal delay-${Math.min(index, 4)} flex flex-col gap-4 border border-hair bg-ink-2 p-4 md:p-5 rounded-sm hover:border-vermilion/50 transition-colors`}
    >
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.25em] uppercase text-vermilion">
          {variant.id}
        </span>
        <span className="display italic text-2xl text-paper-3">{variant.glyph}</span>
      </div>
      <div className="display text-xl md:text-2xl text-paper leading-tight">
        {variant.label}
      </div>
      <div className="flex justify-center py-2">
        <StoryBoard board={variant.board} size="mini" showCoords={false} />
      </div>
      <p className="mono text-[11px] leading-[1.55] text-paper-2">{variant.rule}</p>
    </div>
  );
}

/* ---------------- scene 8: the verdict ---------------- */

function Scene8Verdict() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="relative py-28 md:py-40 px-6 md:px-10 border-t border-hair">
      <div className="mx-auto max-w-6xl space-y-14">
        <div ref={ref} className="reveal space-y-6 max-w-[58ch]">
          <div className="flex items-baseline gap-4">
            <span className="display italic text-3xl md:text-4xl text-vermilion">
              {CHAPTERS[7]!.numeral}
            </span>
            <span className="fade-line is-visible flex-1 origin-left" />
          </div>
          <div className="kicker">{CHAPTERS[7]!.kicker}</div>
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)] text-paper leading-[1.08]">
            Two survive all three{" "}
            <span className="display-italic text-vermilion">axes</span>. Three do
            not.
          </h2>
          <p className="text-paper-2">
            Balance, skill, and earned draws &mdash; pass or fail, per variant, per
            metric. The bars below are the tournament results compressed into three
            numbers. The full per-game logs are checked into the repository, but
            the story they tell is visible from across the room.
          </p>
        </div>

        <VerdictTable />

        <div className="grid md:grid-cols-2 gap-10 pt-8 border-t border-hair text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
          <div className="space-y-4">
            <p className="text-paper max-w-prose">
              <span className="display-italic text-2xl text-vermilion">Sudden Death</span>
              {" "}wins on elegance. Repeat a position, you lose. Every move is
              consequential because the cost of stalling is built into the rule
              itself, not bolted on with a move counter. The network learned this
              quickly: strong AlphaZero beat strong DQN 82 % of the time, and zero
              games ended in a draw. A game that either decides or continues.
            </p>
            <p className="text-paper-3 mono text-[11px]">
              LC1-2 &middot; 52 % W &middot; 82 % skill &middot; 0 % draws
            </p>
          </div>
          <div className="space-y-4">
            <p className="text-paper max-w-prose">
              <span className="display-italic text-2xl text-vermilion">Classic &middot; 29</span>
              {" "}wins on feel. A move budget you can hear ticking, a clean
              tiebreaker (most towers), and draws that exist but are earned &mdash;
              strong players drew each other 5.5 % of the time, no mismatched pair
              ever did. It is the rule I would pick if I were teaching a ten-year-
              old the game, which is the highest compliment a rule change can
              earn.
            </p>
            <p className="text-paper-3 mono text-[11px]">
              LC3-29 &middot; 50 % W &middot; 77 % skill &middot; 5.5 % draws
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-hair text-[1.0625rem] md:text-[1.125rem] leading-[1.75] text-paper-2 max-w-[60ch]">
          <p>
            Of the three that did not survive, the most instructive failure was{" "}
            <strong className="text-paper">LC2-30</strong>. Under a hard cap with no
            tiebreaker, the game is secretly decided by parity: whoever has to move
            on the capping turn loses, so whichever colour's parity lines up with
            the cap wins regardless of play. AlphaZero learned this within an
            afternoon of self-play, and from then on its moves mostly tried to
            burn tempo. A rule that makes{" "}
            <Term term="RL">reinforcement learning</Term> converge on a trick is a
            rule that is not about the board.
          </p>
        </div>
      </div>
    </section>
  );
}

function VerdictTable() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal delay-1 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            {["variant", "balance", "skill", "draws", "verdict"].map((h) => (
              <th key={h} className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 pb-4 border-b border-hair">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VERDICT.map((row, i) => {
            const balanceOk = Math.abs(row.balance - 0.5) <= 0.05;
            const skillOk = row.skill >= 0.75;
            return (
              <tr
                key={row.id}
                className={`align-middle border-b border-hair ${row.winner ? "bg-vermilion/[0.04]" : ""}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <td className="py-5 pr-4">
                  <div className="flex items-baseline gap-3">
                    {row.winner && <span className="display italic text-vermilion text-lg">★</span>}
                    <div>
                      <div className="display text-lg text-paper">{row.label}</div>
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
                      {row.failReason}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const map = {
    pass: { label: "pass", color: "var(--color-vermilion)", bg: "rgba(217,79,44,0.12)" },
    warn: { label: "warn", color: "var(--color-paper-2)", bg: "rgba(236,226,203,0.06)" },
    fail: { label: "fail", color: "var(--color-paper-3)", bg: "rgba(140,132,114,0.10)" },
  };
  const s = map[verdict];
  return (
    <span
      className="mono inline-flex items-center gap-1 text-[10px] tracking-[0.22em] uppercase px-2 py-1 rounded-sm"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}` }}
    >
      {s.label}
    </span>
  );
}


/* ---------------- scene 11: glossary ---------------- */

function Scene11Glossary() {
  const ref = useReveal<HTMLDivElement>();
  const groups: { name: string; key: "AI" | "Pogo" | "Infra"; blurb: string }[] = [
    { name: "AI & learning", key: "AI", blurb: "Tools that learn from playing themselves." },
    { name: "Infrastructure", key: "Infra", blurb: "How the code runs on your laptop and in your browser." },
    { name: "Pogo", key: "Pogo", blurb: "Terms specific to this board." },
  ];
  return (
    <section className="relative py-28 md:py-36 px-6 md:px-10 border-t border-hair">
      <div className="mx-auto max-w-6xl space-y-12">
        <div ref={ref} className="reveal space-y-4 max-w-[60ch]">
          <div className="kicker">Glossary</div>
          <h2 className="display text-[clamp(1.9rem,3.8vw,3rem)] text-paper leading-[1.1]">
            Every term the story used, in{" "}
            <span className="display-italic text-vermilion">plain</span> English.
          </h2>
          <p className="text-paper-2">
            I did not know most of these when I started. The definitions below are the
            versions I wish someone had handed me at the time &mdash; short, specific,
            and free of the assumption that you already know the surrounding ten
            terms.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {groups.map((g) => (
            <div key={g.key} className="space-y-6">
              <div className="space-y-1 pb-3 border-b border-hair">
                <div className="display italic text-2xl text-vermilion">{g.name}</div>
                <div className="mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
                  {g.blurb}
                </div>
              </div>
              <dl className="space-y-5">
                {GLOSSARY.filter((e) => e.group === g.key).map((e) => (
                  <div key={e.term} className="space-y-1.5">
                    <dt className="display text-lg text-paper">{e.term}</dt>
                    <dd className="text-paper-2 text-[0.95rem] leading-[1.65]">
                      {e.long}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- scene 10: epilogue ---------------- */

function Scene10Epilogue() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="relative py-32 md:py-48 px-6 md:px-10 border-t border-hair">
      <div ref={ref} className="reveal mx-auto max-w-[60ch] space-y-8">
        <div className="flex items-baseline gap-4">
          <span className="display italic text-3xl md:text-4xl text-vermilion">
            {CHAPTERS[9]!.numeral}
          </span>
          <span className="fade-line is-visible flex-1 origin-left" />
        </div>
        <div className="kicker">{CHAPTERS[9]!.kicker}</div>

        <h2 className="display text-[clamp(2rem,4vw,3rem)] text-paper leading-[1.08]">
          Keep enough of the problem in your own head to know when something is{" "}
          <span className="display-italic text-vermilion">wrong</span>.
        </h2>

        <div className="space-y-6 text-paper body text-[1.0625rem] leading-[1.75]">
          <p className="dropcap">
            I lost six days to a sentence I did not verify. The sentence came from
            an AI. It would have come from me, too, if I had not been paying
            attention &mdash; that is how plausible it was, and that is the part of
            the story I want to leave with you.
          </p>
          <p>
            The lesson is not that AIs are untrustworthy. It is that fluent
            wrongness sounds exactly like fluent rightness, and the only defence
            is to keep a version of the problem in your own head detailed enough to
            notice when the answer is off by an order of magnitude. You cannot
            outsource the part of the thinking that tells you whether the
            thinking is working.
          </p>
          <p>
            So the rewrite happened: one <Term term="Rust">Rust</Term> engine
            feeding both the training loop and the browser, no drift between
            them; checkpointing on every long job; the rules themselves treated
            as an experimental variable rather than a given. What came out is a
            smaller, honest game. It ends. Skill wins. Draws, when they happen,
            were fought for.
          </p>
          <p>
            The code is open. The minimax solver, the{" "}
            <Term term="AlphaZero">AlphaZero</Term> training pipeline, the fifteen
            rule variants and their per-game logs, the ONNX export sidecar, the
            WebAssembly glue &mdash; all of it lives in a single Rust workspace you
            can clone and run. If you take one thing from this story, let it be
            the clone command: the best way to trust a computation is to do it
            again yourself.
          </p>
          <p className="mono text-[13px] text-paper-3 pt-4 border-t border-hair">
            &mdash; William, spring 2026
          </p>
        </div>
      </div>
    </section>
  );
}
