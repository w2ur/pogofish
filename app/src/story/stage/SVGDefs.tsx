// Global SVG defs shared by all Board instances.
// Safe to hoist because <html data-act> is set globally as the reader scrolls,
// so CSS variable resolution on these gradient stops tracks the current act.
export function SVGDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* gradient on white pieces — driven by act tokens */}
        <linearGradient id="pf-white" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--board-piece-w-from)" }} />
          <stop offset="100%" style={{ stopColor: "var(--board-piece-w-to)" }} />
        </linearGradient>
        {/* gradient on red pieces — driven by act tokens */}
        <linearGradient id="pf-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--board-piece-r-from)" }} />
          <stop offset="100%" style={{ stopColor: "var(--board-piece-r-to)" }} />
        </linearGradient>
        {/* drop shadow */}
        <filter id="pf-piece-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" />
          <feOffset dx="0" dy="2" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* cell inner highlight — driven by act tokens */}
        <radialGradient id="pf-cell-glow" cx="50%" cy="0%" r="80%">
          <stop offset="0%" style={{ stopColor: "var(--board-cell-highlight)" }} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* halo glow filter */}
        <filter id="pf-vermilion-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.7" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
