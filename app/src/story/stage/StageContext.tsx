import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { DEFAULT_VIEW, type StageView } from "./Stage";

interface StageCtx {
  view: StageView;
  setView: (v: Partial<StageView>) => void;
  /** explicitly hide the persistent board (chapters that own a different visual) */
  hide: () => void;
  /** restore visibility */
  show: () => void;
}

const Ctx = createContext<StageCtx | null>(null);

export function StageProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = useState<StageView>(DEFAULT_VIEW);

  const setView = useCallback((partial: Partial<StageView>) => {
    setViewState((prev) => ({ ...prev, ...partial }));
  }, []);

  const hide = useCallback(() => setViewState((p) => ({ ...p, opacity: 0 })), []);
  const show = useCallback(() => setViewState((p) => ({ ...p, opacity: 1 })), []);

  return <Ctx.Provider value={{ view, setView, hide, show }}>{children}</Ctx.Provider>;
}

export function useStage() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStage must be inside <StageProvider>");
  return c;
}

/**
 * Wrap a chapter component to bind it to a stage view (or to hide the stage
 * entirely when the chapter has its own visual). Pass `view={null}` to hide.
 *
 * Implementation note: a direct `scroll` listener is used (rather than GSAP
 * ScrollTrigger) because Lenis intercepts wheel/scroll and doesn't proxy
 * cleanly to ScrollTrigger across all programmatic scroll cases. A scroll
 * listener with rAF throttling is robust and easy to reason about.
 */
export function StageBinder({
  view,
  startRatio = 0.7,
  endRatio = 0.3,
  className,
  children,
}: {
  view: Partial<StageView> | null;
  /** active when section.top crosses viewport.height * startRatio (default 0.7) */
  startRatio?: number;
  /** active until section.bottom crosses viewport.height * endRatio (default 0.3) */
  endRatio?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stage = useStage();

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    let frame = 0;
    let wasActive = false;

    const evaluate = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const isActive = rect.top < vh * startRatio && rect.bottom > vh * endRatio;
      if (isActive && !wasActive) {
        // entered active range
        if (view == null) stage.hide();
        else stage.setView({ ...view, opacity: view.opacity ?? 1 });
      }
      wasActive = isActive;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(evaluate);
    };
    evaluate();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(view), startRatio, endRatio]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
