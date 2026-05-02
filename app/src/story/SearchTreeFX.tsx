import { useMemo } from "react";

/**
 * The minimax search tree, rendered as an SVG that grows with scroll
 * progress. Each generation branches out roughly geometrically; by depth
 * 6 there are ~50M leaves — Pogo's actual reachable state-space size.
 *
 * Rendered behind the persistent stage as a thin tracery: branches glow
 * vermilion, intensifying with depth. The leaf row is the explosion.
 */

interface Props {
  /** sub-progress 0..1 within the beat */
  sub: number;
}

interface Node {
  x: number;
  y: number;
  depth: number;
  parentX?: number;
  parentY?: number;
}

// build a deterministic tree once
const TREE = (() => {
  const nodes: Node[] = [];
  const W = 1600;
  const H = 900;
  const root = { x: W / 2, y: H * 0.05, depth: 0 };
  nodes.push(root);

  const branchingFactors = [3, 3, 3, 4, 5, 6]; // 3*3*3*4*5*6 = 3240 visible leaves

  const build = (parents: Node[], depth: number) => {
    if (depth >= branchingFactors.length) return;
    const next: Node[] = [];
    const totalAtDepth = Math.pow(branchingFactors.slice(0, depth + 1).reduce((a, b) => a * b, 1), 1);
    const yPos = H * 0.05 + (H * 0.85 * (depth + 1)) / branchingFactors.length;
    let i = 0;
    for (const parent of parents) {
      const k = branchingFactors[depth]!;
      // children are spread around parent.x, scaled by inverse of total to fit width
      const spread = W / totalAtDepth;
      for (let c = 0; c < k; c++) {
        const offset = (c - (k - 1) / 2) * spread * (k > 3 ? 0.9 : 1.4);
        const child: Node = {
          x: parent.x + offset,
          y: yPos,
          depth: depth + 1,
          parentX: parent.x,
          parentY: parent.y,
        };
        nodes.push(child);
        next.push(child);
        i++;
      }
    }
    build(next, depth + 1);
  };
  build([root], 0);
  return nodes;
})();

export function SearchTreeFX({ sub }: Props) {
  const totalDepth = 6;
  // reveal depth-by-depth as sub progresses
  const revealedDepth = sub * (totalDepth + 1);

  // memoise per-node opacity calc by mapping
  const nodes = useMemo(() => {
    return TREE.map((n) => {
      const k = Math.min(1, Math.max(0, revealedDepth - n.depth));
      return { ...n, k };
    });
  }, [revealedDepth]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
      style={{ opacity: Math.min(1, sub * 1.6) }}
    >
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="branch-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(217,79,44,0.55)" />
            <stop offset="100%" stopColor="rgba(217,79,44,0.05)" />
          </linearGradient>
        </defs>
        {/* edges */}
        <g>
          {nodes.map((n, i) =>
            n.parentX != null ? (
              <line
                key={`e-${i}`}
                x1={n.parentX}
                y1={n.parentY}
                x2={n.x}
                y2={n.y}
                stroke="url(#branch-gradient)"
                strokeWidth={Math.max(0.4, 2.4 - n.depth * 0.4)}
                opacity={n.k * (0.9 - n.depth * 0.08)}
              />
            ) : null,
          )}
        </g>
        {/* nodes */}
        <g>
          {nodes.map((n, i) => (
            <circle
              key={`n-${i}`}
              cx={n.x}
              cy={n.y}
              r={Math.max(0.5, 3 - n.depth * 0.4)}
              fill="rgba(255,160,120,0.85)"
              opacity={n.k}
            />
          ))}
        </g>
      </svg>
      {/* a subtle vignette to make the tree fade at the edges */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 50%, rgba(18,16,14,0.8) 100%)",
        }}
      />
      {/* state-count plate at bottom */}
      <div
        className="absolute bottom-[6vh] left-1/2 -translate-x-1/2 mono text-[11px] tracking-[0.3em] uppercase text-paper-3 flex flex-col items-center gap-1"
        style={{ opacity: Math.min(1, (sub - 0.3) * 2) }}
      >
        <span>états explorés · branches</span>
        <span className="text-vermilion text-[14px] tabular-nums">
          ~{(Math.pow(3.6, revealedDepth) * 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
