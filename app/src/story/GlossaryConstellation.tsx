import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { GLOSSARY } from "./data";
import { useLang } from "./LangContext";
import { STRINGS } from "./i18n";

/**
 * The glossary as an interactive constellation. Each term is a node positioned
 * inside its category cluster (AI / Infra / Pogo), connected by faint edges
 * to conceptually-related terms. Hovering a node lights it up plus its
 * neighbours, and reveals the long definition in a side panel.
 *
 * Replaces the previous three-column list. Last visual moment of the article.
 */

type TermKey = string;
type Edge = [TermKey, TermKey];

// Conceptual relationships between terms — hand-curated, not exhaustive.
const EDGES: Edge[] = [
  ["Minimax", "Alpha-beta pruning"],
  ["Minimax", "Transposition table"],
  ["Alpha-beta pruning", "Transposition table"],
  ["RL", "Q-learning"],
  ["Q-learning", "DQN"],
  ["DQN", "AlphaZero"],
  ["AlphaZero", "MCTS"],
  ["MCTS", "PUCT"],
  ["AlphaZero", "Self-play"],
  ["AlphaZero", "Policy / value network"],
  ["Self-play", "Gatekeeper"],
  ["Gatekeeper", "Round robin"],
  ["RL", "AlphaZero"],
  ["RL", "DQN"],
  ["Rust", "WASM"],
  ["Rust", "ONNX"],
  ["WASM", "ONNX"],
  ["Manhattan distance", "Lazy equilibrium"],
  ["Minimax", "RL"],
];

// Deterministic golden-spiral placement inside a cluster.
function spiralPositions(
  cx: number,
  cy: number,
  count: number,
  rmin: number,
  rmax: number,
): { x: number; y: number }[] {
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    const r = rmin + (rmax - rmin) * Math.sqrt(t);
    const angle = i * phi + 0.7; // small offset so first node isn't right of center
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

interface NodeData {
  term: string;
  label: string;
  group: "AI" | "Infra" | "Pogo";
  x: number;
  y: number;
  short: string;
  long: string;
}

function useNodes(lang: "en" | "fr"): { nodes: NodeData[]; edges: Edge[] } {
  return useMemo(() => {
    const byGroup = {
      AI: GLOSSARY.filter((e) => e.group === "AI"),
      Infra: GLOSSARY.filter((e) => e.group === "Infra"),
      Pogo: GLOSSARY.filter((e) => e.group === "Pogo"),
    };
    // Cluster centers in a 1600x900 viewBox
    const clusters = {
      AI: { cx: 560, cy: 470, rmin: 130, rmax: 360 },
      Infra: { cx: 1280, cy: 270, rmin: 60, rmax: 150 },
      Pogo: { cx: 1280, cy: 720, rmin: 50, rmax: 130 },
    };
    const nodes: NodeData[] = [];
    for (const g of ["AI", "Infra", "Pogo"] as const) {
      const positions = spiralPositions(
        clusters[g].cx,
        clusters[g].cy,
        byGroup[g].length,
        clusters[g].rmin,
        clusters[g].rmax,
      );
      byGroup[g].forEach((entry, i) => {
        const label = lang === "fr" && entry.termFr ? entry.termFr : entry.term;
        nodes.push({
          term: entry.term,
          label,
          group: g,
          x: positions[i]!.x,
          y: positions[i]!.y,
          short: entry.short[lang],
          long: entry.long[lang],
        });
      });
    }
    return { nodes, edges: EDGES };
  }, [lang]);
}

export function GlossaryConstellation() {
  const { lang } = useLang();
  const { nodes, edges } = useNodes(lang);
  const [activeTerm, setActiveTerm] = useState<TermKey | null>(null);

  const nodeByTerm = useMemo(() => {
    const m = new Map<TermKey, NodeData>();
    for (const n of nodes) m.set(n.term, n);
    return m;
  }, [nodes]);

  const active = activeTerm ? nodeByTerm.get(activeTerm) : null;

  const neighbours = useMemo(() => {
    if (!activeTerm) return new Set<TermKey>();
    const set = new Set<TermKey>();
    for (const [a, b] of edges) {
      if (a === activeTerm) set.add(b);
      if (b === activeTerm) set.add(a);
    }
    return set;
  }, [activeTerm, edges]);

  return (
    <section className="relative py-28 md:py-36 px-6 md:px-10 border-t border-hair">
      <div className="mx-auto max-w-7xl space-y-12">
        <div className="space-y-4 max-w-[60ch]">
          <div className="kicker">{STRINGS.scene11.kicker[lang]}</div>
          <h2 className="display text-[clamp(1.9rem,3.8vw,3rem)] text-paper leading-[1.1]">
            {STRINGS.scene11.h2A[lang]}
            <span className="display-italic text-vermilion">{STRINGS.scene11.h2B[lang]}</span>
            {STRINGS.scene11.h2C[lang]}
          </h2>
          <p className="text-paper-2">{STRINGS.scene11.intro[lang]}</p>
          <p className="mono text-[10px] tracking-[0.28em] uppercase text-paper-3 mt-4">
            {lang === "fr"
              ? "Survolez un terme — la constellation l'éclaire avec ses voisins."
              : "Hover a term — the constellation lights it up with its neighbours."}
          </p>
        </div>

        <div className="relative">
          <svg
            viewBox="0 0 1600 900"
            className="w-full h-auto"
            style={{ maxHeight: "min(72vh, 720px)" }}
          >
            <defs>
              <radialGradient id="cluster-glow-ai" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(217,79,44,0.07)" />
                <stop offset="70%" stopColor="rgba(217,79,44,0)" />
              </radialGradient>
              <radialGradient id="cluster-glow-infra" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(141,132,114,0.06)" />
                <stop offset="70%" stopColor="rgba(141,132,114,0)" />
              </radialGradient>
              <radialGradient id="cluster-glow-pogo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(236,226,203,0.05)" />
                <stop offset="70%" stopColor="rgba(236,226,203,0)" />
              </radialGradient>
            </defs>

            {/* cluster halos */}
            <circle cx="540" cy="470" r="320" fill="url(#cluster-glow-ai)" />
            <circle cx="1240" cy="280" r="180" fill="url(#cluster-glow-infra)" />
            <circle cx="1240" cy="700" r="140" fill="url(#cluster-glow-pogo)" />

            {/* edges */}
            {edges.map(([a, b], i) => {
              const na = nodeByTerm.get(a);
              const nb = nodeByTerm.get(b);
              if (!na || !nb) return null;
              const isHot =
                activeTerm != null &&
                (a === activeTerm || b === activeTerm);
              return (
                <line
                  key={`e-${i}`}
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  stroke={isHot ? "var(--color-vermilion)" : "rgba(141,132,114,0.28)"}
                  strokeWidth={isHot ? 1.4 : 0.8}
                  style={{ transition: "stroke 240ms ease, stroke-width 240ms ease" }}
                />
              );
            })}

            {/* nodes */}
            {nodes.map((n) => {
              const isActive = n.term === activeTerm;
              const isNeighbour = neighbours.has(n.term);
              const dimmed = activeTerm != null && !isActive && !isNeighbour;
              const colour =
                n.group === "AI"
                  ? "rgba(217,79,44,1)"
                  : n.group === "Infra"
                  ? "rgba(180,160,120,1)"
                  : "rgba(236,226,203,1)";
              return (
                <g
                  key={n.term}
                  onMouseEnter={() => setActiveTerm(n.term)}
                  onMouseLeave={() => setActiveTerm(null)}
                  onFocus={() => setActiveTerm(n.term)}
                  onBlur={() => setActiveTerm(null)}
                  tabIndex={0}
                  style={{
                    cursor: "pointer",
                    opacity: dimmed ? 0.32 : 1,
                    transition: "opacity 240ms ease",
                    outline: "none",
                  }}
                >
                  <motion.circle
                    cx={n.x}
                    cy={n.y}
                    initial={false}
                    animate={{
                      r: isActive ? 11 : isNeighbour ? 8 : 5.5,
                    }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    fill={colour}
                    style={{
                      filter: isActive
                        ? "drop-shadow(0 0 14px rgba(217,79,44,0.85))"
                        : isNeighbour
                        ? "drop-shadow(0 0 8px rgba(217,79,44,0.45))"
                        : "drop-shadow(0 0 4px rgba(0,0,0,0.6))",
                    }}
                  />
                  <text
                    x={n.x}
                    y={n.y - 14}
                    textAnchor="middle"
                    fill={isActive ? "var(--color-paper)" : isNeighbour ? "var(--color-paper)" : "var(--color-paper-2)"}
                    fontSize={isActive ? 18 : 13}
                    fontFamily="var(--font-display)"
                    fontStyle="italic"
                    style={{ transition: "font-size 240ms ease, fill 240ms ease, opacity 240ms ease" }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}

            {/* cluster labels */}
            <text
              x="220"
              y="220"
              fill="var(--color-vermilion)"
              fontFamily="var(--font-mono)"
              fontSize="14"
              letterSpacing="6"
            >
              {STRINGS.scene11.groups.AI.name[lang].toUpperCase()}
            </text>
            <text
              x="1100"
              y="120"
              fill="var(--color-paper-3)"
              fontFamily="var(--font-mono)"
              fontSize="12"
              letterSpacing="6"
            >
              {STRINGS.scene11.groups.Infra.name[lang].toUpperCase()}
            </text>
            <text
              x="1100"
              y="820"
              fill="var(--color-paper-3)"
              fontFamily="var(--font-mono)"
              fontSize="12"
              letterSpacing="6"
            >
              {STRINGS.scene11.groups.Pogo.name[lang].toUpperCase()}
            </text>
          </svg>

          {/* side panel: definition of active term */}
          <motion.div
            className="absolute top-0 right-0 md:top-6 md:right-6 max-w-[360px] w-full md:w-[360px]"
            initial={false}
            animate={{
              opacity: active ? 1 : 0,
              y: active ? 0 : -8,
              pointerEvents: active ? "auto" : "none",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {active && (
              <div className="bg-ink-2 border border-hair border-l-2 border-l-vermilion p-5 backdrop-blur shadow-2xl">
                <div className="mono text-[9px] tracking-[0.32em] uppercase text-vermilion mb-2">
                  {active.group === "AI"
                    ? STRINGS.scene11.groups.AI.name[lang]
                    : active.group === "Infra"
                    ? STRINGS.scene11.groups.Infra.name[lang]
                    : STRINGS.scene11.groups.Pogo.name[lang]}
                </div>
                <div className="display-italic text-2xl text-paper mb-3 leading-tight">
                  {active.label}
                </div>
                <p className="text-paper-2 text-[0.95rem] leading-[1.6]">{active.long}</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* fallback static list — mobile + a11y */}
        <details className="mt-8">
          <summary className="mono text-[10px] tracking-[0.3em] uppercase text-paper-3 cursor-pointer hover:text-vermilion select-none">
            {lang === "fr" ? "Voir la liste complète" : "See the full list"}
          </summary>
          <div className="mt-6 grid md:grid-cols-3 gap-8">
            {(["AI", "Infra", "Pogo"] as const).map((g) => (
              <div key={g} className="space-y-4">
                <div className="display italic text-xl text-vermilion">
                  {STRINGS.scene11.groups[g].name[lang]}
                </div>
                <dl className="space-y-3">
                  {GLOSSARY.filter((e) => e.group === g).map((e) => {
                    const label = lang === "fr" && e.termFr ? e.termFr : e.term;
                    return (
                      <div key={e.term} className="space-y-1">
                        <dt className="display text-[1.05rem] text-paper">{label}</dt>
                        <dd className="text-paper-2 text-[0.9rem] leading-[1.6]">
                          {e.long[lang]}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
