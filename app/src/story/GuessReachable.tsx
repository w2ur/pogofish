import { useState } from "react";
import { motion } from "motion/react";
import { useLang } from "./LangContext";
import { useGuess } from "./GuessContext";
import { FMT } from "./data";

/**
 * The thesis made interactive. Before the transcript reveals the AI's
 * "≈ 1,000,000" estimate, the reader commits to their OWN number for how many
 * positions Pogo can reach. The truth is withheld — it surfaces later, at the
 * slam and in chapter VII — so the reader carries a committed wrong answer of
 * their own into the moment the AI's is exposed. That is the whole point: a
 * fluent wrong number feels exactly like a fluent right one until something
 * checks it.
 */

const MIN_EXP = 5; // 100,000
const MAX_EXP = 8; // 100,000,000

/** Map a 0..1000 slider position onto a log scale of reachable-state counts. */
export function sliderToValue(s: number): number {
  const clamped = Math.max(0, Math.min(1000, s));
  const exp = MIN_EXP + (clamped / 1000) * (MAX_EXP - MIN_EXP);
  return Math.round(10 ** exp);
}

export function GuessReachable() {
  const { lang } = useLang();
  const { setGuess } = useGuess();
  // Default near "about a million" — the intuitive answer, and the one the AI
  // gives, so the reader starts where the mistake starts.
  const [s, setS] = useState(415);
  const [locked, setLocked] = useState(false);
  const value = sliderToValue(s);

  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="my-8 border border-hair bg-ink-2 rounded-sm p-5 md:p-6"
    >
      <div className="kicker mb-3">
        {t("before you read on", "avant de lire la suite")}
      </div>
      <p className="text-paper text-[1.0625rem] leading-[1.6] mb-5 max-w-[46ch]">
        {t(
          "Pogo is three by three, twelve pieces, no captures — pieces only restack. How many distinct positions can it reach? Commit to a number before the machine gives me its own.",
          "Pogo, c'est trois sur trois, douze pièces, aucune capture — les pièces ne font que s'empiler. Combien de positions distinctes peut-il atteindre ? Avancez un nombre avant que la machine ne me donne le sien.",
        )}
      </p>

      {!locked ? (
        <>
          <div className="flex items-end justify-between mb-2">
            <span className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3">
              {t("your guess", "votre estimation")}
            </span>
            <span className="display-italic text-vermilion text-4xl tabular-nums">
              {FMT.compact(value)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={s}
            onChange={(e) => setS(Number(e.target.value))}
            aria-label={t(
              "Guess the number of reachable Pogo positions",
              "Estimez le nombre de positions de Pogo atteignables",
            )}
            aria-valuetext={FMT.compact(value)}
            className="pf-guess-range w-full"
          />
          <div className="flex justify-between mono text-[10px] text-paper-3 mt-1 tabular-nums">
            <span>100k</span>
            <span>1M</span>
            <span>10M</span>
            <span>100M</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setGuess(value);
              setLocked(true);
            }}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 border border-vermilion text-vermilion mono text-[11px] tracking-[0.2em] uppercase hover:bg-vermilion hover:text-ink transition-colors"
          >
            {t("Lock it in →", "Je valide →")}
          </button>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="border-l-2 border-vermilion pl-3">
              <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3">
                {t("you said", "vous avez dit")}
              </div>
              <div className="display-italic text-vermilion text-3xl tabular-nums">
                {FMT.compact(value)}
              </div>
            </div>
            <div className="border-l border-hair pl-3">
              <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3">
                {t("the machine, in a moment", "la machine, dans un instant")}
              </div>
              <div className="display-italic text-paper-2 text-3xl tabular-nums">
                ≈ 1M
              </div>
            </div>
          </div>
          <p className="text-paper-2 text-[1rem] leading-[1.6] max-w-[46ch]">
            {t(
              "A million is what I'd have said too. Hold on to your number — neither of us is about to look clever.",
              "Un million, je l'aurais dit aussi. Gardez votre nombre en tête — aucun de nous deux n'est sur le point d'avoir l'air malin.",
            )}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
