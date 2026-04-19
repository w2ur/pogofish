import { useEffect, useRef, useState, type ReactNode } from "react";
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
 */
export function Term({ term, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
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
      <span className="term-popover" role="tooltip">
        <span className="term-popover-head">{displayTerm}</span>
        {shortText}
      </span>
    </span>
  );
}
