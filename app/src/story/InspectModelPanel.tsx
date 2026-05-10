import { type InspectResult } from "../hooks/useAI";
import type { AILevel } from "../ai/player";
import { moveLabel } from "./insights";
import { type Lang } from "./LangContext";

const COPY = {
  caption: {
    en: "model inference — current position",
    fr: "inférence du modèle — position actuelle",
  },
  valueHead: { en: "value head", fr: "tête de valeur" },
  policyHead: { en: "policy head — legal moves, ranked", fr: "tête de politique — coups légaux, classés" },
  loading: { en: "thinking…", fr: "réflexion…" },
  noNet: {
    en: "Inspector requires a neural opponent (DQN or AlphaZero).",
    fr: "L'inspecteur requiert un adversaire neuronal (DQN ou AlphaZero).",
  },
  redWins: { en: "red wins", fr: "rouge gagne" },
  whiteWins: { en: "white wins", fr: "blanc gagne" },
  even: { en: "even", fr: "équilibré" },
};

interface Props {
  result: InspectResult | null;
  loading: boolean;
  level: AILevel;
  lang: Lang;
}

const NEURAL_LEVELS: AILevel[] = ["dqn", "alphazero", "alphazero-mcts"];

export function InspectModelPanel({ result, loading, level, lang }: Props) {
  if (!NEURAL_LEVELS.includes(level)) {
    return (
      <div className="w-full max-w-[min(85vw,420px)] rounded-sm border border-dashed border-hair p-4">
        <div className="kicker mb-2">{COPY.caption[lang]}</div>
        <p className="text-paper-3 text-[13px] leading-snug">{COPY.noNet[lang]}</p>
      </div>
    );
  }

  if (!result || loading) {
    return (
      <div className="w-full max-w-[min(85vw,420px)] rounded-sm border border-dashed border-hair p-4">
        <div className="kicker mb-2">{COPY.caption[lang]}</div>
        <p className="text-paper-3 text-[13px] animate-pulse">{COPY.loading[lang]}</p>
      </div>
    );
  }

  const { legalMoves, policyProbs, value } = result;
  // Sort indices by probability desc, keep mapping back to legalMoves
  const order = legalMoves
    .map((_, i) => i)
    .sort((a, b) => (policyProbs[b] ?? 0) - (policyProbs[a] ?? 0));

  // Value head bar: -1 (red wins) → 0 (even) → +1 (white wins).
  // Map to 0..1 for visual position.
  const valueNorm = (Math.max(-1, Math.min(1, value)) + 1) / 2;
  const valueLabel =
    value > 0.15
      ? COPY.whiteWins[lang]
      : value < -0.15
        ? COPY.redWins[lang]
        : COPY.even[lang];

  return (
    <div className="w-full max-w-[min(85vw,420px)] rounded-sm border border-hair p-4 space-y-4">
      <div className="kicker">{COPY.caption[lang]}</div>

      {/* Value head */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
            {COPY.valueHead[lang]}
          </span>
          <span className="mono text-[11px] text-paper">
            V = {value.toFixed(3)} <span className="text-paper-3">·</span>{" "}
            <span className="text-vermilion">{valueLabel}</span>
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-ink-3 overflow-hidden">
          {/* center mark */}
          <div
            className="absolute top-0 bottom-0 w-px bg-paper-3 opacity-40"
            style={{ left: "50%" }}
          />
          {/* value indicator */}
          <div
            className="absolute top-0 bottom-0 bg-vermilion transition-[left,width] duration-300"
            style={
              value >= 0
                ? { left: "50%", width: `${valueNorm * 100 - 50}%` }
                : { right: "50%", width: `${(0.5 - valueNorm) * 100}%` }
            }
          />
        </div>
        <div className="flex justify-between mt-1 mono text-[9px] text-paper-3">
          <span>−1 {COPY.redWins[lang]}</span>
          <span>0</span>
          <span>+1 {COPY.whiteWins[lang]}</span>
        </div>
      </div>

      {/* Policy head */}
      <div>
        <div className="mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-2">
          {COPY.policyHead[lang]}
        </div>
        <ul className="space-y-1.5">
          {order.map((idx, rank) => {
            const move = legalMoves[idx]!;
            const prob = policyProbs[idx] ?? 0;
            const isTop = rank === 0;
            const label = moveLabel(move.fromCell, move.toCell, move.numPieces);
            return (
              <li key={idx} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2">
                <span
                  className={`mono text-[11px] ${isTop ? "text-vermilion" : "text-paper-2"}`}
                >
                  {label}
                </span>
                <span className="relative h-1.5 rounded-full bg-ink-3 overflow-hidden">
                  <span
                    className={`absolute inset-y-0 left-0 ${isTop ? "bg-vermilion" : "bg-paper-3"} transition-[width] duration-300`}
                    style={{ width: `${Math.max(2, prob * 100)}%` }}
                  />
                </span>
                <span
                  className={`mono text-[10px] tabular-nums text-right ${isTop ? "text-vermilion" : "text-paper-3"}`}
                >
                  {(prob * 100).toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
