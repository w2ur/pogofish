import type { ReactNode } from "react";
import { useReveal } from "./useReveal";

export function Callout({ children }: { children: ReactNode }) {
  const ref = useReveal<HTMLQuoteElement>();
  return (
    <blockquote
      ref={ref}
      className="reveal delay-1 my-12 mx-auto max-w-2xl border-l-2 border-vermilion pl-6 py-2"
    >
      <p className="display-italic text-2xl md:text-3xl text-paper leading-snug">
        {children}
      </p>
    </blockquote>
  );
}
