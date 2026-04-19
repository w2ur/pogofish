import { useEffect, useState } from "react";
import { StoryBoard } from "./StoryBoard";
import type { StoryBoard as StoryBoardData } from "./data";
import { CHAPTERS } from "./data";
import { useReveal } from "./useReveal";
import {
  cellLabel,
  findProbe,
  formatPercent,
  loadInsights,
  type InsightsPayload,
} from "./insights";

/* -------------------------------------------------------------------------- */
/* Scene X — what the AI learned                                              */
/* -------------------------------------------------------------------------- */

export function LearningsScene() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useReveal<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    loadInsights()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <section
        id="chapter-x"
        className="relative px-6 py-24 min-h-[40vh] flex items-center justify-center"
      >
        <p className="mono text-paper-3 text-sm">Could not load insights: {err}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section
        id="chapter-x"
        className="relative px-6 py-24 min-h-[40vh] flex items-center justify-center"
      >
        <p className="mono text-paper-3 text-sm">Loading what the AI learned…</p>
      </section>
    );
  }

  const topOpening = data.opening_move_distribution[0];
  const openingProbe = findProbe(data, "opening");
  const developmentProbe = findProbe(data, "development");
  const midgameProbe = findProbe(data, "midgame");

  // Capture-timing: find the peak ply and how many games captured in plies 6-10.
  const capturePeakPly = data.capture_timing_histogram
    .map((v, i) => ({ v, i }))
    .reduce((a, b) => (b.v > a.v ? b : a), { v: -1, i: 0 });
  const capturesInWindow = data.capture_timing_histogram
    .slice(6, 11)
    .reduce((a, b) => a + b, 0);

  return (
    <section
      id="chapter-x"
      className="relative px-6 py-28 md:py-36 border-t border-hair"
      style={{ scrollMarginTop: 80 }}
    >
      <div ref={ref} className="reveal mx-auto max-w-5xl space-y-4 text-center mb-16">
        <div className="kicker justify-center">
          {CHAPTERS[10]!.numeral} &middot; {CHAPTERS[10]!.kicker}
        </div>
        <h2 className="display text-[clamp(2.25rem,5vw,4rem)] text-paper max-w-3xl mx-auto leading-[1.05]">
          After <span className="display-italic text-vermilion">{data.games_played}</span>{" "}
          games against itself, the network had opinions.
        </h2>
        <p className="body text-paper-2 max-w-2xl mx-auto">
          These come from the same model you just played against — LC3-29, at 200{" "}
          <abbr title="Monte Carlo Tree Search">MCTS</abbr> simulations per move.
          Stats are empirical; diagrams are real positions from the sweep.
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-20">
        {/* Insight 1: opening is memorized */}
        {topOpening && openingProbe && (
          <Insight
            number="01"
            claim={
              <>
                White&apos;s first move is nearly predetermined. {cellLabel(topOpening.from_cell)}{" "}
                → {cellLabel(topOpening.to_cell)} in{" "}
                <span className="text-vermilion">
                  {formatPercent(topOpening.frequency)}
                </span>{" "}
                of games.
              </>
            }
            detail={
              <>
                Across {data.games_played} self-play games the network tried only{" "}
                {data.opening_move_distribution.length} distinct first moves. It knows
                which square it wants.
              </>
            }
            board={openingProbe.board}
            boardLabel="initial position"
          />
        )}

        {/* Insight 2: captures peak early then taper */}
        <Insight
          number="02"
          claim={
            <>
              Captures peak at <span className="text-vermilion">ply {capturePeakPly.i}</span>,
              then taper as the position locks.
            </>
          }
          detail={
            <>
              {capturesInWindow} of {data.games_played} games record a capture in plies
              6–10. After move 15, captures are rare — the network trades early, then
              plays for tempo.
            </>
          }
          chart={<CaptureChart histogram={data.capture_timing_histogram} />}
        />

        {/* Insight 3: confidence swings violently mid-game */}
        {developmentProbe && midgameProbe && (
          <Insight
            number="03"
            claim={
              <>
                The network&apos;s confidence swings hard on small trades.
              </>
            }
            detail={
              <>
                Same game, twelve plies apart. In the first position the value head says{" "}
                <span className="text-vermilion">
                  +{developmentProbe.value_estimate.toFixed(2)}
                </span>{" "}
                (White wins). Twelve plies later, after a forced trade sequence, it says{" "}
                <span className="text-vermilion">
                  {midgameProbe.value_estimate.toFixed(2)}
                </span>{" "}
                (Red wins). Pogo has tactical cliffs, and AlphaZero sees them.
              </>
            }
            twoBoards={{
              left: { board: developmentProbe.board, label: "+0.55 — White wins" },
              right: { board: midgameProbe.board, label: "-0.47 — Red wins" },
            }}
          />
        )}

        {/* Insight 4: first-player advantage is the law */}
        <Insight
          number="04"
          claim={
            <>
              First player wins by design:{" "}
              <span className="text-vermilion">
                {formatPercent(data.white_win_rate)} White
              </span>
              , {formatPercent(data.red_win_rate)} Red,{" "}
              {formatPercent(data.draw_rate)} draws.
            </>
          }
          detail={
            <>
              Against itself, the network produces a 2:1 first-player advantage. The
              Classic variant (LC3-29) softens this with draws but doesn&apos;t erase
              it — move order matters more than any strategic subtlety.
            </>
          }
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

interface InsightProps {
  number: string;
  claim: React.ReactNode;
  detail: React.ReactNode;
  board?: string[][];
  boardLabel?: string;
  twoBoards?: {
    left: { board: string[][]; label: string };
    right: { board: string[][]; label: string };
  };
  chart?: React.ReactNode;
}

function Insight({
  number,
  claim,
  detail,
  board,
  boardLabel,
  twoBoards,
  chart,
}: InsightProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal grid gap-10 md:gap-16 md:grid-cols-[1fr_minmax(240px,360px)] items-start"
    >
      <div className="space-y-4">
        <div className="kicker">{number}</div>
        <p className="display text-[clamp(1.4rem,2.4vw,2rem)] text-paper leading-[1.2]">
          {claim}
        </p>
        <p className="body text-paper-2 max-w-xl">{detail}</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {board && (
          <>
            <StoryBoard board={board as unknown as StoryBoardData} size="default" showCoords />
            {boardLabel && (
              <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3">
                {boardLabel}
              </div>
            )}
          </>
        )}
        {twoBoards && (
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="flex flex-col items-center gap-2">
              <StoryBoard board={twoBoards.left.board as unknown as StoryBoardData} size="mini" showCoords={false} />
              <div className="mono text-[10px] tracking-[0.18em] uppercase text-paper-3">
                {twoBoards.left.label}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <StoryBoard board={twoBoards.right.board as unknown as StoryBoardData} size="mini" showCoords={false} />
              <div className="mono text-[10px] tracking-[0.18em] uppercase text-paper-3">
                {twoBoards.right.label}
              </div>
            </div>
          </div>
        )}
        {chart}
      </div>
    </div>
  );
}

function CaptureChart({ histogram }: { histogram: number[] }) {
  const maxVal = Math.max(1, ...histogram);
  const bars = histogram.slice(0, 30);
  return (
    <div className="w-full max-w-[360px]">
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3 mb-2">
        captures by ply
      </div>
      <div className="flex items-end gap-[2px] h-28 border-b border-hair">
        {bars.map((v, i) => {
          const h = Math.max(2, Math.round((v / maxVal) * 100));
          return (
            <div
              key={i}
              className="flex-1 bg-vermilion/70 hover:bg-vermilion transition-colors"
              style={{ height: `${h}%` }}
              title={`ply ${i}: ${v}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mono text-[9px] text-paper-3 mt-1.5 tracking-[0.15em]">
        <span>0</span>
        <span>15</span>
        <span>29</span>
      </div>
    </div>
  );
}
