import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type GlossaryEntry } from "./data";
import { useLang } from "./LangContext";

const LOOKUP: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((entry) => [entry.term.toLowerCase(), entry]),
);

interface Props {
  term: string;
  children?: ReactNode;
}

/**
 * Inline term with a tap/hover popover.
 * - hover on desktop
 * - tap on mobile (toggles `data-open`)
 * - closes on outside click, Escape, or scroll
 *
 * Edge-aware positioning: when open, the popover is shifted laterally
 * so it never clips against the viewport edges (the previous version
 * was centered absolutely and got cut off near the left/right margin
 * of the page or in narrow columns like the glossary grid).
 */
export function Term({ term, children }: Props) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const popRef = useRef<HTMLSpanElement | null>(null);
  const { lang } = useLang();
  const entry = LOOKUP[term.toLowerCase()];
  const displayTerm = entry ? (lang === "fr" && entry.termFr ? entry.termFr : entry.term) : term;
  const shortText = entry ? entry.short[lang] : "";

  useEffect(() => {
    if (!open || !entry) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, entry]);

  // Shift the popover horizontally so it stays inside the viewport.
  useLayoutEffect(() => {
    if (!open || !ref.current || !popRef.current) {
      setShift(0);
      return;
    }
    const margin = 8;
    const pop = popRef.current.getBoundingClientRect();
    let dx = 0;
    if (pop.left < margin) dx = margin - pop.left;
    else if (pop.right > window.innerWidth - margin) dx = window.innerWidth - margin - pop.right;
    if (dx !== 0) setShift((prev) => prev + dx);
  }, [open, lang, shortText]);

  if (!entry) {
    return <span>{children ?? term}</span>;
  }

  return (
    <span
      ref={ref}
      className="term"
      data-open={open || undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      tabIndex={0}
      role="button"
      aria-label={`${displayTerm}. ${shortText}`}
    >
      {children ?? displayTerm}
      <span
        ref={popRef}
        className="term-popover"
        role="tooltip"
        style={shift !== 0 ? { ["--term-shift" as string]: `${shift}px` } : undefined}
      >
        <span className="term-popover-head">{displayTerm}</span>
        {shortText}
      </span>
    </span>
  );
}
