import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "motion/react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { GLOSSARY } from "./data";
import { useLang } from "./LangContext";
import { STRINGS } from "./i18n";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * The glossary as an interactive force-directed constellation. Each term is a
 * node, edges are conceptual relationships, and a d3-force simulation pulls
 * related terms together. Reader can drag a node — its neighbours follow.
 *
 * Replaces the previous spiral placement. Last visual moment of the article.
 */

type TermKey = string;
type Edge = [TermKey, TermKey];

// Conceptual relationships between terms — hand-curated, not exhaustive.
// Intra-cluster edges establish the core relationships within each group.
// Inter-cluster edges (marked with comments) connect the three groups into
// one connected organism so the force simulation produces a single graph,
// not three disconnected islands.
const EDGES: Edge[] = [
  // --- AI cluster (intra) ---
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
  ["Minimax", "RL"],
  // --- Infra cluster (intra) ---
  ["Rust", "WASM"],
  ["Rust", "ONNX"],
  ["WASM", "ONNX"],
  // --- Pogo cluster (intra) ---
  ["Manhattan distance", "Lazy equilibrium"],
  // --- Inter-cluster bridges: AI ↔ Infra ---
  ["AlphaZero", "ONNX"],    // AlphaZero model exported and served as ONNX
  ["WASM", "AlphaZero"],    // AlphaZero policy runs via WASM in the browser
  // --- Inter-cluster bridges: AI ↔ Pogo ---
  ["Minimax", "Manhattan distance"],  // Minimax uses Manhattan distance as heuristic in Pogo
  ["Self-play", "Lazy equilibrium"],  // Self-play surfaces lazy equilibria as a training signal
];

const VIEW_W = 1600;
const VIEW_H = 900;

// Cluster anchors used for initial node placement. Tightened into the central
// ~70% of the canvas (x: 240–1360, y: 135–765) to avoid clusters drifting
// into empty corners. The large AI cluster sits centre-left; Infra and Pogo
// occupy the right side stacked vertically, closer to the AI core so the
// inter-cluster force edges pull them together naturally.
const CLUSTERS = {
  AI: { cx: 600, cy: 450, r: 220 },
  Infra: { cx: 1150, cy: 280, r: 120 },
  Pogo: { cx: 1150, cy: 650, r: 110 },
} as const;

interface SimNode extends SimulationNodeDatum {
  term: string;
  label: string;
  group: "AI" | "Infra" | "Pogo";
  short: string;
  long: string;
  degree: number;
}

type SimLink = SimulationLinkDatum<SimNode>;

interface BuiltGraph {
  nodes: SimNode[];
  links: SimLink[];
  edges: Edge[];
  degreeByTerm: Map<TermKey, number>;
}

function buildGraph(lang: "en" | "fr"): BuiltGraph {
  // Compute degree once from EDGES so node size scales with connectivity.
  const degreeByTerm = new Map<TermKey, number>();
  for (const [a, b] of EDGES) {
    degreeByTerm.set(a, (degreeByTerm.get(a) ?? 0) + 1);
    degreeByTerm.set(b, (degreeByTerm.get(b) ?? 0) + 1);
  }

  const phi = Math.PI * (3 - Math.sqrt(5));
  const groupCounts = { AI: 0, Infra: 0, Pogo: 0 };
  const groupTotals = {
    AI: GLOSSARY.filter((e) => e.group === "AI").length,
    Infra: GLOSSARY.filter((e) => e.group === "Infra").length,
    Pogo: GLOSSARY.filter((e) => e.group === "Pogo").length,
  };

  const nodes: SimNode[] = GLOSSARY.map((entry) => {
    const g = entry.group;
    const total = groupTotals[g];
    const i = groupCounts[g]++;
    const t = (i + 0.5) / total;
    const r = CLUSTERS[g].r * Math.sqrt(t);
    const angle = i * phi + 0.7;
    const label = lang === "fr" && entry.termFr ? entry.termFr : entry.term;
    return {
      term: entry.term,
      label,
      group: g,
      short: entry.short[lang],
      long: entry.long[lang],
      degree: degreeByTerm.get(entry.term) ?? 0,
      x: CLUSTERS[g].cx + r * Math.cos(angle),
      y: CLUSTERS[g].cy + r * Math.sin(angle),
    };
  });

  const links: SimLink[] = EDGES.map(([a, b]) => ({ source: a, target: b }));

  return { nodes, links, edges: EDGES, degreeByTerm };
}

// Per-degree visual size. Scales 5.5 → ~12 across observed degrees (1–6).
function radiusFor(degree: number, isActive: boolean, isNeighbour: boolean): number {
  const base = 5.5 + Math.min(degree, 6) * 0.9;
  if (isActive) return base + 5;
  if (isNeighbour) return base + 2;
  return base;
}

export function GlossaryConstellation() {
  const { lang } = useLang();
  const reducedMotion = usePrefersReducedMotion();

  const graph = useMemo(() => buildGraph(lang), [lang]);

  // Ref holds the live simulation + node objects (mutated in place by d3).
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>(graph.nodes);
  // Tick counter triggers re-render; positions are read from nodesRef.
  const [, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  const [activeTerm, setActiveTerm] = useState<TermKey | null>(null);
  const [hoverTerm, setHoverTerm] = useState<TermKey | null>(null);
  const draggingRef = useRef<TermKey | null>(null);

  // (Re)build the simulation whenever the graph changes (lang switch).
  useEffect(() => {
    nodesRef.current = graph.nodes;

    const sim = forceSimulation<SimNode>(graph.nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(graph.links)
          .id((n) => n.term)
          .distance(80)
          .strength(0.5),
      )
      .force("charge", forceManyBody<SimNode>().strength(-180))
      .force("center", forceCenter(VIEW_W / 2, VIEW_H / 2))
      .force("collide", forceCollide<SimNode>(28))
      .stop();

    if (reducedMotion) {
      // Settle headlessly, then freeze — no live ticking, no drag heating.
      for (let i = 0; i < 100; i++) sim.tick();
      setTick((t) => t + 1);
      simRef.current = sim;
      return () => {
        sim.stop();
      };
    }

    // Pre-settle a chunk so first paint isn't a chaotic explosion.
    for (let i = 0; i < 100; i++) sim.tick();

    let running = true;
    sim.alpha(0.4).restart();
    sim.on("tick", () => {
      // Keep nodes inside the viewBox.
      for (const n of nodesRef.current) {
        if (n.x === undefined || n.y === undefined) continue;
        n.x = Math.max(40, Math.min(VIEW_W - 40, n.x));
        n.y = Math.max(40, Math.min(VIEW_H - 40, n.y));
      }
      // Batch React updates onto a single rAF so we re-render at most once
      // per frame regardless of d3's tick cadence.
      if (running && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setTick((t) => (t + 1) % 1_000_000);
        });
      }
    });

    simRef.current = sim;

    return () => {
      running = false;
      sim.on("tick", null);
      sim.stop();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [graph, reducedMotion]);

  const nodeByTerm = useMemo(() => {
    const m = new Map<TermKey, SimNode>();
    for (const n of graph.nodes) m.set(n.term, n);
    return m;
  }, [graph]);

  const focusTerm = activeTerm ?? hoverTerm;
  const active = focusTerm ? nodeByTerm.get(focusTerm) : null;

  const neighbours = useMemo(() => {
    if (!focusTerm) return new Set<TermKey>();
    const set = new Set<TermKey>();
    for (const [a, b] of graph.edges) {
      if (a === focusTerm) set.add(b);
      if (b === focusTerm) set.add(a);
    }
    return set;
  }, [focusTerm, graph.edges]);

  // --- drag handlers (pointer events for touch + mouse) -------------------

  const onPointerDown = (term: TermKey) => (event: ReactPointerEvent<SVGGElement>) => {
    if (reducedMotion) return;
    const node = nodeByTerm.get(term);
    const sim = simRef.current;
    if (!node || !sim) return;

    draggingRef.current = term;
    setHoverTerm(term);

    node.fx = node.x;
    node.fy = node.y;
    sim.alphaTarget(0.3).restart();

    // Capture pointer so we keep getting move events even if it leaves the node.
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const onPointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const term = draggingRef.current;
    if (!term) return;
    const node = nodeByTerm.get(term);
    if (!node) return;

    const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    node.fx = local.x;
    node.fy = local.y;
  };

  const onPointerUp = (event: ReactPointerEvent<SVGGElement>) => {
    const term = draggingRef.current;
    if (!term) return;
    const node = nodeByTerm.get(term);
    const sim = simRef.current;
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    if (sim) sim.alphaTarget(0);
    draggingRef.current = null;
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      // ignore — pointer may already have been released
    }
  };

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
              ? "Glissez un terme — la constellation suit. Survol pour révéler les liens."
              : "Drag a term — the constellation follows. Hover to reveal the links."}
          </p>
        </div>

        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full h-auto select-none touch-none"
            style={{ maxHeight: "min(72vh, 720px)" }}
            role="img"
            aria-labelledby="constellation-title"
          >
            <title id="constellation-title">
              {lang === "fr"
                ? "Constellation de termes : trois groupes — IA, Infrastructure, Pogo — reliés par des liens conceptuels."
                : "Term constellation: three clusters — AI, Infrastructure, Pogo — linked by conceptual relationships."}
            </title>
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
              <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* cluster halos — rendered around the (now drifting) cluster
                centres so the AI/Infra/Pogo backdrop still reads. Positions
                match the tightened CLUSTERS anchors. */}
            <circle cx="600" cy="450" r="300" fill="url(#cluster-glow-ai)" />
            <circle cx="1150" cy="280" r="160" fill="url(#cluster-glow-infra)" />
            <circle cx="1150" cy="650" r="140" fill="url(#cluster-glow-pogo)" />

            {/* edges — visible at rest so the graph reads as connected immediately;
                opacity and colour ramp up when a neighbour node is focused. */}
            {graph.edges.map(([a, b], i) => {
              const na = nodeByTerm.get(a);
              const nb = nodeByTerm.get(b);
              if (!na || !nb || na.x === undefined || nb.x === undefined) return null;
              const isHot =
                focusTerm != null && (a === focusTerm || b === focusTerm);
              // Determine whether this edge crosses clusters (inter) for a
              // slightly higher resting opacity so the bridges read clearly.
              const isInterCluster = na.group !== nb.group;
              const restingOpacity = isInterCluster ? 0.38 : 0.22;
              return (
                <line
                  key={`e-${i}`}
                  x1={na.x}
                  y1={na.y!}
                  x2={nb.x}
                  y2={nb.y!}
                  stroke={isHot ? "var(--color-vermilion)" : `rgba(141,132,114,${restingOpacity})`}
                  strokeWidth={isHot ? 1.6 : isInterCluster ? 0.8 : 0.5}
                  style={{ transition: "stroke 240ms ease, stroke-width 240ms ease" }}
                />
              );
            })}

            {/* nodes */}
            {graph.nodes.map((n) => {
              const isActive = n.term === focusTerm;
              const isNeighbour = neighbours.has(n.term);
              const dimmed = focusTerm != null && !isActive && !isNeighbour;
              const colour =
                n.group === "AI"
                  ? "rgba(217,79,44,1)"
                  : n.group === "Infra"
                  ? "rgba(180,160,120,1)"
                  : "rgba(236,226,203,1)";
              const r = radiusFor(n.degree, isActive, isNeighbour);
              return (
                <g
                  key={n.term}
                  role="button"
                  aria-label={`${n.label}: ${n.short}`}
                  onMouseEnter={() => setHoverTerm(n.term)}
                  onMouseLeave={() => {
                    if (draggingRef.current !== n.term) setHoverTerm((t) => (t === n.term ? null : t));
                  }}
                  onFocus={() => setActiveTerm(n.term)}
                  onBlur={() => setActiveTerm((t) => (t === n.term ? null : t))}
                  onPointerDown={onPointerDown(n.term)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  tabIndex={0}
                  style={{
                    cursor: reducedMotion ? "pointer" : "grab",
                    opacity: dimmed ? 0.32 : 1,
                    transition: "opacity 240ms ease",
                    outline: "none",
                  }}
                >
                  <motion.circle
                    cx={n.x ?? 0}
                    cy={n.y ?? 0}
                    initial={false}
                    animate={{ r }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    fill={colour}
                    filter={isActive ? "url(#node-glow)" : undefined}
                    style={{
                      filter: isActive
                        ? undefined
                        : isNeighbour
                        ? "drop-shadow(0 0 8px rgba(217,79,44,0.45))"
                        : "drop-shadow(0 0 4px rgba(0,0,0,0.6))",
                    }}
                  />
                  <text
                    x={n.x ?? 0}
                    y={(n.y ?? 0) - (r + 8)}
                    textAnchor="middle"
                    fill={
                      isActive
                        ? "var(--color-paper)"
                        : isNeighbour
                        ? "var(--color-paper)"
                        : "var(--color-paper-2)"
                    }
                    fontSize={isActive ? 18 : 13}
                    fontFamily="var(--font-display)"
                    fontStyle="italic"
                    style={{ transition: "font-size 240ms ease, fill 240ms ease, opacity 240ms ease" }}
                    pointerEvents="none"
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}

            {/* cluster labels — positions updated to match tightened anchors */}
            <text
              x="300"
              y="190"
              fill="var(--color-vermilion)"
              fontFamily="var(--font-mono)"
              fontSize="14"
              letterSpacing="6"
            >
              {STRINGS.scene11.groups.AI.name[lang].toUpperCase()}
            </text>
            <text
              x="980"
              y="140"
              fill="var(--color-paper-3)"
              fontFamily="var(--font-mono)"
              fontSize="12"
              letterSpacing="6"
            >
              {STRINGS.scene11.groups.Infra.name[lang].toUpperCase()}
            </text>
            <text
              x="980"
              y="775"
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

        {/* Screen-reader-only term list — gives AT users immediate access to all
            terms and definitions without needing to expand the details widget.
            Visually hidden via sr-only (Tailwind utility). */}
        <ul className="sr-only" aria-label={lang === "fr" ? "Liste de tous les termes du glossaire" : "Full glossary term list"}>
          {GLOSSARY.map((e) => {
            const label = lang === "fr" && e.termFr ? e.termFr : e.term;
            return (
              <li key={e.term}>
                <strong>{label}</strong>: {e.long[lang]}
              </li>
            );
          })}
        </ul>

        {/* fallback static list — mobile + visual readers */}
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
