import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { StoryBoard } from "./StoryBoard";
import type { StoryBoard as StoryBoardData } from "./data";
import { useReveal } from "./useReveal";
import { useLang } from "./LangContext";
import { EnFr } from "./EnFr";
import { STRINGS } from "./i18n";
import { Board as AnimatedBoard } from "./stage/Board";
import {
  findProbe,
  formatPercent,
  loadInsights,
  moveLabel,
  type InsightsPayload,
} from "./insights";

/* -------------------------------------------------------------------------- */
/* Scene X — what the AI learned                                              */
/* -------------------------------------------------------------------------- */

export function LearningsScene() {
  const { lang } = useLang();
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
        <p className="mono text-paper-3 text-sm">{STRINGS.learnings.loadError[lang]}{err}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section
        id="chapter-x"
        className="relative px-6 py-24 min-h-[40vh] flex items-center justify-center"
      >
        <p className="mono text-paper-3 text-sm">{STRINGS.learnings.loading[lang]}</p>
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
      <div ref={ref} className="mx-auto max-w-5xl space-y-4 text-center mb-16">
        <div className="kicker justify-center">
          XI &middot; {STRINGS.chapters.XI[lang]}
        </div>
        <h2 className="display text-[clamp(2.25rem,5vw,4rem)] text-paper max-w-3xl mx-auto leading-[1.05]">
          {STRINGS.learnings.h2A[lang]}
          <span className="display-italic text-vermilion">{data.games_played}</span>
          {STRINGS.learnings.h2B[lang]}
        </h2>
        <p className="body text-paper-2 max-w-2xl mx-auto">
          {STRINGS.learnings.intro[lang]}
          {STRINGS.learnings.introMid[lang]}
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-20">
        <HeatmapHero data={data} />

        {/* Insight 1: opening is memorized */}
        {topOpening && openingProbe && (
          <Insight
            number="01"
            claim={
              <EnFr
                en={<>
                  White&apos;s first move is nearly predetermined.{" "}
                  <span className="mono">{moveLabel(topOpening.from_cell, topOpening.to_cell, topOpening.num_pieces)}</span>{" "}
                  in{" "}
                  <span className="text-vermilion">{formatPercent(topOpening.frequency)}</span>{" "}
                  of games. (The bracket gives the stack size moved — Pogo lets you take
                  one, two or three pieces from a cell where your colour is on top.)
                </>}
                fr={<>
                  Le premier coup des Blancs, à peu de chose près, est écrit
                  d'avance :{" "}
                  <span className="mono">{moveLabel(topOpening.from_cell, topOpening.to_cell, topOpening.num_pieces)}</span>,
                  dans{" "}
                  <span className="text-vermilion">{formatPercent(topOpening.frequency)}</span>{" "}
                  des parties. (Le crochet indique la taille de la pile déplacée :
                  à Pogo, on prend une, deux ou trois pièces sur une case où sa
                  couleur est au sommet.)
                </>}
              />
            }
            detail={
              <EnFr
                en={<>
                  Across {data.games_played} self-play games the network tried only{" "}
                  {data.opening_move_distribution.length} distinct first moves. It knows
                  which square it wants.
                </>}
                fr={<>
                  Sur {data.games_played} parties qu'il a jouées contre lui-même,
                  le réseau n'a essayé que {data.opening_move_distribution.length}{" "}
                  premiers coups distincts. Il sait la case qu'il veut atteindre.
                </>}
              />
            }
            board={openingProbe.board}
            boardLabel={STRINGS.learnings.initialPosition[lang]}
          />
        )}

        {/* Insight 2: captures peak early then taper */}
        <Insight
          number="02"
          claim={
            <EnFr
              en={<>
                Captures peak at <span className="text-vermilion">ply {capturePeakPly.i}</span>,
                then taper as the position locks.
              </>}
              fr={<>
                Les captures culminent au <span className="text-vermilion">demi-coup {capturePeakPly.i}</span>,
                puis s'espacent à mesure que la position se fige.
              </>}
            />
          }
          detail={
            <EnFr
              en={<>
                {capturesInWindow} of {data.games_played} games record a capture in plies
                6–10. After move 15, captures are rare — the network trades early, then
                plays for tempo.
              </>}
              fr={<>
                {capturesInWindow} parties sur {data.games_played} voient une
                capture se produire entre les demi-coups 6 et 10. Passé le
                coup 15, les captures se raréfient : le réseau règle ses
                échanges tôt, puis joue pour le tempo.
              </>}
            />
          }
          chart={<CaptureChart histogram={data.capture_timing_histogram} />}
        />

        {/* Insight 3: confidence swings violently mid-game */}
        {developmentProbe && midgameProbe && (
          <Insight
            number="03"
            claim={
              <EnFr
                en={<>The network&apos;s confidence swings hard on small trades.</>}
                fr={<>La confiance du réseau bascule brutalement sur de tout petits échanges.</>}
              />
            }
            detail={
              <EnFr
                en={<>
                  Same game, twelve plies apart. In the first position the value head says{" "}
                  <span className="text-vermilion">+{developmentProbe.value_estimate.toFixed(2)}</span>{" "}
                  (White wins). Twelve plies later, after a forced trade sequence, it says{" "}
                  <span className="text-vermilion">{midgameProbe.value_estimate.toFixed(2)}</span>{" "}
                  (Red wins). Pogo has tactical cliffs, and AlphaZero sees them.
                </>}
                fr={<>
                  Même partie, à douze demi-coups d'écart. À la première
                  position, la tête valeur annonce{" "}
                  <span className="text-vermilion">+{developmentProbe.value_estimate.toFixed(2)}</span>{" "}
                  — Blanc gagne. Douze demi-coups plus tard, après une séquence
                  d'échanges forcés, elle dit{" "}
                  <span className="text-vermilion">{midgameProbe.value_estimate.toFixed(2)}</span>{" "}
                  — Rouge gagne. Pogo a ses falaises tactiques, et AlphaZero les
                  voit venir.
                </>}
              />
            }
            twoBoards={{
              left:  { board: developmentProbe.board, label: `+0.55 — ${STRINGS.learnings.whiteWinsShort[lang]}` },
              right: { board: midgameProbe.board,     label: `-0.47 — ${STRINGS.learnings.redWinsShort[lang]}` },
            }}
          />
        )}

        {/* Insight 4: first-player advantage is the law */}
        <Insight
          number="04"
          claim={
            <EnFr
              en={<>
                First player wins by design:{" "}
                <span className="text-vermilion">{formatPercent(data.white_win_rate)} White</span>,{" "}
                {formatPercent(data.red_win_rate)} Red,{" "}
                {formatPercent(data.draw_rate)} draws.
              </>}
              fr={<>
                Le premier joueur l'emporte par construction :{" "}
                <span className="text-vermilion">{formatPercent(data.white_win_rate)} au Blanc</span>,{" "}
                {formatPercent(data.red_win_rate)} au Rouge,{" "}
                {formatPercent(data.draw_rate)} de nuls.
              </>}
            />
          }
          detail={
            <EnFr
              en={<>
                Against itself, the network produces a 2:1 first-player advantage. The
                Classic variant (LC3-29) softens this with draws but doesn&apos;t erase
                it — move order matters more than any strategic subtlety.
              </>}
              fr={<>
                Face à lui-même, le réseau creuse un avantage de deux contre
                un en faveur du premier joueur. La variante Classique (LC3-29)
                atténue cet écart par la possibilité du nul, mais elle ne
                l'efface pas — l'ordre de jeu pèse, en définitive, plus lourd
                que toute subtilité stratégique.
              </>}
            />
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
  const { lang } = useLang();
  const maxVal = Math.max(1, ...histogram);
  const bars = histogram.slice(0, 30);
  return (
    <div className="w-full max-w-[360px]">
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3 mb-2">
        {STRINGS.learnings.capturesByPly[lang]}
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

/* ---------------- heatmap hero ---------------- */

/**
 * Renders the persistent-board's "heatmap" mode, weighted by how often the
 * trained network plays into each cell as White's first ply. Visualises the
 * "where the network looks first" insight before the prose digs in.
 */
function HeatmapHero({ data }: { data: InsightsPayload }) {
  const { lang } = useLang();
  const ref = useReveal<HTMLDivElement>();

  // Build a 9-cell intensity vector from opening_move_distribution.
  // Weight by both source and destination cell, normalised to 0..1.
  const heatmap = useMemo(() => {
    const counts = new Array<number>(9).fill(0);
    for (const m of data.opening_move_distribution) {
      // emphasise destination (where the piece goes); add a faint trace at source.
      counts[m.to_cell] = (counts[m.to_cell] ?? 0) + m.frequency;
      counts[m.from_cell] = (counts[m.from_cell] ?? 0) + m.frequency * 0.4;
    }
    const max = Math.max(...counts);
    if (max <= 0) return new Array<number>(9).fill(0);
    return counts.map((c) => c / max);
  }, [data]);

  const top = data.opening_move_distribution[0];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative mb-16 mx-auto max-w-4xl grid md:grid-cols-[auto_1fr] gap-10 items-center px-4 py-10 border border-hair bg-ink-2/40"
    >
      {/* heatmap board */}
      <div className="flex justify-center">
        <div style={{ width: "min(40vmin, 320px)", height: "min(40vmin, 320px)" }}>
          <AnimatedBoard
            frameIdx={0}
            mode="heatmap"
            heatmap={heatmap}
            glow={0.25}
            instant
            className="w-full h-full"
          />
        </div>
      </div>

      {/* legend + summary */}
      <div className="space-y-4">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-vermilion">
          {lang === "fr" ? "carte de chaleur — coups d'ouverture" : "heatmap — opening moves"}
        </div>
        <h3 className="display text-[clamp(1.4rem,2.5vw,2rem)] text-paper leading-tight">
          {lang === "fr"
            ? "Là où le réseau regarde en premier."
            : "Where the network looks first."}
        </h3>
        <p className="text-paper-2 text-[0.96rem] leading-[1.65]">
          {lang === "fr" ? (
            <>
              Plus une case est saturée, plus le réseau y joue souvent au
              tout début de la partie. Les Blancs ne jouent presque jamais
              en dehors d'un petit ensemble de cases — la diagonale et le
              centre. La meilleure ouverture observée :{" "}
              <span className="text-vermilion mono">
                {top ? moveLabel(top.from_cell, top.to_cell, top.num_pieces) : "—"}
              </span>
              {top && <> dans <span className="text-vermilion">{formatPercent(top.frequency)}</span> des parties.</>}
            </>
          ) : (
            <>
              The brighter the cell, the more often the network plays there
              in the very first ply. White almost never plays outside a
              tiny set of squares — the diagonal and the centre. Most-
              played first move:{" "}
              <span className="text-vermilion mono">
                {top ? moveLabel(top.from_cell, top.to_cell, top.num_pieces) : "—"}
              </span>
              {top && <> in <span className="text-vermilion">{formatPercent(top.frequency)}</span> of games.</>}
            </>
          )}
        </p>
        {/* gradient legend */}
        <div className="pt-2 flex items-center gap-3">
          <div
            className="h-1.5 w-32 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(20,16,13,1) 0%, rgba(217,79,44,0.45) 50%, var(--color-vermilion) 100%)",
            }}
          />
          <span className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3">
            {lang === "fr" ? "rare → fréquent" : "rare → frequent"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
