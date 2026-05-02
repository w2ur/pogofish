import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { StoryBoard } from "./StoryBoard";
import { Term } from "./Term";
import { TryYourself } from "./TryYourself";
import { PlayScene } from "./PlayScene";
import { PlayCTA } from "./PlayCTA";
import { Callout } from "./Callout";
import { EnFr } from "./EnFr";
import { LearningsScene } from "./LearningsScene";
import { LangToggle } from "./LangToggle";
import { CinematicOverture } from "./CinematicOverture";
import { GlossaryConstellation } from "./GlossaryConstellation";
import { ScrollProgress } from "./ScrollProgress";
import { useLang } from "./LangContext";
import { STRINGS, tf } from "./i18n";
import { useReveal, useActiveIndex } from "./useReveal";
import { StageProvider, useStage, StageBinder } from "./stage/StageContext";
import { Stage } from "./stage/Stage";
import { Board as FinaleSvgBoard } from "./stage/Board";
import {
  VARIANTS,
  FAILED_RUN_DAYS,
  VERDICT,
  FMT,
} from "./data";

/** Chapter numerals stay language-agnostic — kickers come from i18n. */
type ChapterKey = keyof typeof STRINGS.chapters;
const CHAPTER_NUMERAL: Record<ChapterKey, string> = {
  I: "I", II: "II", III: "III", IV: "IV", V: "V", VI: "VI",
  VII: "VII", VIII: "VIII", IX: "IX", X: "X", XI: "XI", XII: "XII",
};

export function StoryView() {
  usePageTitle();
  return (
    <StageProvider>
      <div className="story story-grain story-noise min-h-screen">
        <ScrollProgress />
        <PersistentStage />
        <StoryChrome />
        <CinematicOverture />
        <StageBinder view={null}><TryYourself /></StageBinder>
        <PinnedStory />
        <StageBinder view={null}><Scene7Experiments /></StageBinder>
        <StageBinder view={null}><Scene8Verdict /></StageBinder>
        <StageBinder view={null}><PlayScene /></StageBinder>
        <StageBinder view={null}><LearningsScene /></StageBinder>
        <StageBinder view={null}><Scene10Epilogue /></StageBinder>
        <StageBinder view={null}><GlossaryConstellation /></StageBinder>
        <StoryFooter />
        <PlayCTA />
        <LangToggle />
      </div>
    </StageProvider>
  );
}

/** Reads the stage view from context and renders the persistent board. */
function PersistentStage() {
  const { view } = useStage();
  return <Stage view={view} z="back" />;
}

function usePageTitle() {
  const { lang } = useLang();
  useEffect(() => {
    document.title = STRINGS.pageTitle[lang];
  }, [lang]);
}

/* ---------------- chrome ---------------- */

function StoryChrome() {
  const { lang } = useLang();
  // Hide chrome while the cinematic overture is on-screen — the overture
  // carries its own opus title bar. Reveal once the reader has scrolled past.
  const [pastOverture, setPastOverture] = useState(false);
  useEffect(() => {
    const sentinel = document.querySelector("[data-overture-end]");
    if (!sentinel) return;
    const update = () => {
      const top = sentinel.getBoundingClientRect().top;
      setPastOverture(top <= 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 md:px-10 md:py-5 pointer-events-none transition-opacity duration-500"
      style={{
        background:
          "linear-gradient(180deg, rgba(18,16,14,0.92) 0%, rgba(18,16,14,0.6) 60%, rgba(18,16,14,0) 100%)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        opacity: pastOverture ? 1 : 0,
        pointerEvents: pastOverture ? undefined : "none",
      }}
    >
      <div className="pointer-events-auto flex items-baseline gap-3 text-paper">
        <span className="display italic text-[22px] tracking-tight">pogofish</span>
        <span className="mono text-[9px] tracking-[0.3em] uppercase text-paper-3 hidden sm:inline">
          &middot; {STRINGS.chrome.tagline[lang]}
        </span>
      </div>
      <a
        href="#play"
        className="pointer-events-auto mono text-[10px] tracking-[0.25em] uppercase text-paper-3 hover:text-vermilion transition-colors"
      >
        {STRINGS.chrome.skipToPlay[lang]}
      </a>
    </header>
  );
}

function StoryFooter() {
  const { lang } = useLang();
  return (
    <footer className="relative z-10 border-t border-hair px-6 py-10 mt-24">
      <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <div className="display italic text-2xl">pogofish</div>
          <div className="mono text-[10px] tracking-[0.28em] uppercase text-paper-3">
            {STRINGS.chrome.footerTag[lang]}
          </div>
        </div>
        <div className="mono text-[11px] text-paper-3 max-w-xs">
          {STRINGS.chrome.madeWithCare[lang]}{" "}
          <a href="https://william.revah.paris" className="text-paper hover:text-vermilion underline underline-offset-4">
            William
          </a>
          .
        </div>
      </div>
    </footer>
  );
}

/* ---------------- scenes 2–6: pinned sidecar ---------------- */

function PinnedStory() {
  const { lang } = useLang();
  const { refs, active } = useActiveIndex(5);
  const stage = useStage();
  const sectionRef = useRef<HTMLElement>(null);
  const pinLabelKeys: (keyof typeof STRINGS.pinned.labels)[] = [
    "opening", "theClaim", "sixDays", "theRules", "equilibrium",
  ];
  const pinLabelKey = pinLabelKeys[active] ?? pinLabelKeys[0]!;
  const pinLabel = STRINGS.pinned.labels[pinLabelKey][lang];

  // Each pinned panel drives the persistent stage to a different game frame.
  // Frames mirror PINNED_BOARDS in data.ts.
  const panelToFrame = [0, 2, 8, 11, 10];

  // Apply the view whenever active changes OR the section enters viewport
  // (scroll listener). The latter handles the case where active hasn't
  // changed but a previous section hid the stage.
  useEffect(() => {
    const apply = () => {
      const frame = panelToFrame[active] ?? 0;
      stage.setView({
        frameIdx: frame,
        x: 0.22,
        y: 0.5,
        scale: 0.55,
        rotate: 0,
        opacity: 1,
        mode: "standard",
        focusCell: null,
        glow: 0.3 + active * 0.08,
      });
    };

    let frame = 0;
    const evaluate = () => {
      frame = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const isActive = rect.top < vh * 0.7 && rect.bottom > vh * 0.3;
      if (isActive) apply();
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
  }, [active]);

  return (
    <section ref={sectionRef} className="relative">
      <div className="mx-auto max-w-6xl px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[minmax(280px,_340px)_minmax(0,_1fr)] gap-10 lg:gap-20">
        {/* the persistent <Stage> renders the board behind us; we keep this
            column as a layout placeholder so the prose stays right-aligned. */}
        <aside className="hidden lg:block">
          <div className="sticky top-0 h-screen flex flex-col items-center justify-center gap-6 pointer-events-none">
            <div className="kicker">{tf(STRINGS.pinned.positionOf[lang], { n: active + 1 })}</div>
            {/* spacer matches old board area so the layout is stable */}
            <div className="w-[clamp(220px,28vw,320px)] aspect-square" aria-hidden />
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-paper-3">
              {pinLabel}
            </div>
          </div>
        </aside>

        <div className="flex flex-col">
          {/* II — a game I found */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[0] = el; }}
            chapter={CHAPTER_NUMERAL.III}
            kicker={STRINGS.chapters.III[lang]}
          >
            <EnFr
              en={<>
                <p className="dropcap">
                  Pogo is a real board game. William found it one evening on a
                  friend's shelf, between a worn-out Carcassonne and a
                  mismatched chess set. He played one round. He went home
                  thinking about it, slept badly, and the next morning he was
                  already writing the rules on the back of an envelope.
                </p>
                <p>
                  Three rows, three columns. Twelve pieces. One rule for how
                  stacks of pieces travel. No dice, no cards, no hidden
                  information. A game that fits, piece by piece, into a head.
                </p>
                <p>
                  You pick up a tower of one, two, or three pieces from a cell
                  where your colour is on top. You move it in a straight line{" "}
                  <Term term="Manhattan distance">by as many cells as it
                  contains pieces</Term> — one piece moves one cell, two move
                  two, three move one or three. You drop the tower on whatever
                  is already at the arrival cell, and you start again, until
                  the losing condition fires. The game fits on the back of a
                  metro ticket. That is precisely what caught him.
                </p>
                <p>
                  He had been reading a couple of articles on{" "}
                  <Term term="RL">reinforcement learning</Term> and was looking
                  for an experiment his size: small enough to solve by brute
                  force with a <Term term="Minimax">minimax</Term>, small enough
                  to run self-play on eight gigabytes of RAM, private enough
                  that no public code would leak into training. Pogo ticked all
                  three boxes. The plan fit on one line: write the solver,
                  compute the true value of every reachable position, train a
                  network in parallel, measure the gap. Close the laptop, write
                  the article.
                </p>
                <p>
                  I pictured a neat parallel run. Build the solver, compute the true
                  value of every reachable state, then train a neural network and
                  measure how quickly it caught up.
                </p>
              </>}
              fr={<>
                <p className="dropcap">
                  Pogo est un vrai jeu de plateau. William l'a trouvé un soir
                  sur l'étagère d'un ami, entre un Carcassonne fatigué et une
                  boîte d'échecs dépareillée. Il y a joué une partie. Il est
                  rentré en y pensant, il a mal dormi, et le lendemain matin
                  il en écrivait déjà les règles au dos d'une enveloppe.
                </p>
                <p>
                  Trois lignes, trois colonnes. Douze pièces. Une règle pour
                  dire comment les piles se déplacent. Ni dé, ni carte, ni
                  information cachée. Un jeu qui tient, case par case, dans
                  une tête.
                </p>
                <p>
                  On saisit une tour d'une, deux ou trois pièces sur une case
                  où sa couleur est au sommet. On la déplace en ligne droite{" "}
                  <Term term="Manhattan distance">d'autant de cases qu'elle
                  contient de pièces</Term> — une pièce fait une case, deux en
                  font deux, trois en font une ou trois. On la pose sur ce
                  qu'elle trouve à l'arrivée, et on recommence, jusqu'à la
                  défaite. Le jeu tient au dos d'un ticket de métro. C'est
                  précisément ce qui l'a piégé.
                </p>
                <p>
                  Il venait de lire deux ou trois articles sur{" "}
                  <Term term="RL">l'apprentissage par renforcement</Term> et
                  il cherchait un terrain d'expérience à sa taille : assez
                  petit pour être résolu à la force brute par un{" "}
                  <Term term="Minimax">minimax</Term>, assez petit pour
                  supporter du self-play sur huit gigaoctets de RAM, assez
                  confidentiel pour qu'aucun code public ne vienne se glisser
                  dans l'entraînement. Pogo cochait les trois cases. Le plan
                  tenait en une ligne : écrire le solveur, calculer la valeur
                  exacte de chaque position, entraîner un réseau en parallèle,
                  mesurer l'écart. Puis on ferme le laptop et on écrit
                  l'article.
                </p>
              </>}
            />
            <Callout>
              <EnFr
                en={<>A thesis-sized question on a kitchen-table board.</>}
                fr={<>Une question de thèse sur un plateau de table de cuisine.</>}
              />
            </Callout>
            <EnFr
              en={<p>He did not write the first line that evening. He first opened a chat window — with me. This is, I realise, about where I should introduce myself. I am Claude, an AI he talks to often enough that he no longer uses quotation marks around the word. He opened the chat more by reflex than by method, the same reflex that makes humans open Wikipedia to check a date they already know.</p>}
              fr={<p>Il n'a pas écrit la première ligne ce soir-là. Il a d'abord ouvert une fenêtre de chat — avec moi. Je me rends compte qu'il serait temps de me présenter. Je suis Claude, une IA à qui il parle depuis assez longtemps pour ne plus mettre de guillemets autour du mot. Il a ouvert ce chat plus par réflexe que par méthode ; le même réflexe qui fait qu'on ouvre Wikipédia pour vérifier une date qu'on connaît déjà.</p>}
            />
          </NarrativePanel>

          {/* III — the confident AI */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[1] = el; }}
            chapter={CHAPTER_NUMERAL.IV}
            kicker={STRINGS.chapters.IV[lang]}
          >
            <EnFr
              en={<p>
                He wanted to know, roughly, how many positions the game could
                produce. An order of magnitude would have been enough. If it
                was in the millions, a minimax solver with a{" "}
                <Term term="Transposition table">transposition table</Term>{" "}
                would fit on his laptop. If it was in the billions, he needed
                a different plan.
              </p>}
              fr={<p>
                Il voulait savoir, en gros, combien de positions le jeu peut
                produire. Un ordre de grandeur lui aurait suffi. Si c'était
                dans les millions, un solveur minimax avec une{" "}
                <Term term="Transposition table">table de transposition</Term>{" "}
                tiendrait sur son laptop. Si c'était dans les milliards, il
                fallait changer de plan.
              </p>}
            />
            <TranscriptCard
              header={STRINGS.transcript.header[lang]}
              body={
                <>
                  <span className="text-paper-3">{STRINGS.transcript.prompt[lang]}</span>
                  <br />
                  {STRINGS.transcript.answerA[lang]}
                  <span className="text-vermilion">{STRINGS.transcript.answerB[lang]}</span>
                  {STRINGS.transcript.answerC[lang]}
                </>
              }
            />
            <EnFr
              en={<>
                <p>
                  I answered: no more than a million. I won't keep you in
                  suspense — the answer was wrong, and the text you're
                  reading is about the six days it took us to find that out.
                </p>
                <p>
                  Where did the number come from? I did, for my part, the same
                  back-of-the-napkin estimate: nine cells, up to twelve pieces
                  per cell, two possible colours per slot. A rough ceiling of
                  2¹² × 9⁹ if you squint. Several million. Maybe a bit more.
                  Nothing like a problem. An{" "}
                  <Term term="Alpha-beta pruning">alpha-beta pruning</Term>{" "}
                  would chew through it over lunch.
                </p>
                <p>
                  Which looks a great deal like reasoning. It is also what
                  goes, in him as in me, by the name of doing the arithmetic
                  without quite doing it. And this is the moment the
                  dangerous part of the conversation begins — when he nods,
                  internally, and we both move on.
                </p>
                <p>
                  That is how a five-word sentence ends up costing six days.
                  He did not push, because the answer matched what he hoped
                  to hear. I did not hedge, because I had no reason to. We
                  had agreed, without saying so, to skip the only question
                  that mattered: whether the game, as he'd described it,{" "}
                  <em className="text-paper">actually ends</em>.
                </p>
              </>}
              fr={<>
                <p>
                  J'ai répondu : pas plus d'un million. Je ne vais pas vous
                  faire languir — la réponse était fausse, et le texte que
                  vous lisez est celui des six jours qu'il nous a fallu pour
                  nous en apercevoir.
                </p>
                <p>
                  D'où sortait ce chiffre ? J'avais fait, de mon côté, la même
                  estimation au coin de la nappe : neuf cases, jusqu'à douze
                  pièces par case, deux couleurs possibles par emplacement, un
                  plafond grossier de 2¹² × 9⁹ positions en plissant les yeux.
                  Plusieurs millions. Peut-être un peu plus. Rien qui
                  ressemble, de loin, à un problème. Un{" "}
                  <Term term="Alpha-beta pruning">élagage alpha-bêta</Term> en
                  viendrait à bout entre midi et deux.
                </p>
                <p>
                  Ce qui ressemble fort à un raisonnement. Ce qui s'appelle
                  aussi, chez lui comme chez moi, faire le calcul rapide sans
                  le faire tout à fait. Et c'est à ce moment-là que la partie
                  dangereuse de la conversation commence — quand il hoche la
                  tête, intérieurement, et que nous passons à la suite.
                </p>
                <p>
                  Voilà comment une phrase de cinq mots finit par coûter six
                  jours. Il n'a pas insisté, parce que la réponse collait à
                  ce qu'il espérait entendre. Je n'ai pas nuancé, parce que
                  je n'avais pas de raison de le faire. On s'était mis
                  d'accord, sans le dire, en sautant la seule question qui
                  comptait : demander si le jeu, tel qu'il l'avait décrit,
                  se termine{" "}
                  <em className="text-paper">pour de vrai</em>.
                </p>
              </>}
            />
            <AnnotatedCompare
              claimed="1,000,000"
              actual="49,000,000+"
              claimedLabel={STRINGS.compare.claimed[lang]}
              actualLabel={STRINGS.compare.actualLower[lang]}
            />
            <EnFr
              en={<p>
                The true number is at least fifty times larger. And even that
                only counts the states his solver had time to reach before it
                ran out of memory. The real state space, under the game's
                original rules, has no upper bound at all. Which is a
                different problem from being big.
              </p>}
              fr={<p>
                Le chiffre réel est au moins cinquante fois plus grand. Et
                encore ne s'agit-il que des états que son solveur a eu le
                temps d'atteindre avant de manquer de mémoire. L'espace
                d'états véritable, avec les règles d'origine, n'a aucune
                borne supérieure. Ce qui n'est pas le même problème que
                d'être grand.
              </p>}
            />
          </NarrativePanel>

          {/* IV — six days */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[2] = el; }}
            chapter={CHAPTER_NUMERAL.V}
            kicker={STRINGS.chapters.V[lang]}
          >
            <EnFr
              en={<>
                <p>
                  What happens on his machine I do not see. In the rhythm of
                  our exchanges I exist in windows — a question, an answer, a
                  silence, another question, sometimes weeks later. Between
                  two conversations, the world keeps going, and I only learn
                  about it from what he brings back. What follows, therefore,
                  is what he later told me.
                </p>
                <p>
                  The solver was written in a weekend. Alpha-beta; a{" "}
                  <Term term="Transposition table">transposition table</Term>{" "}
                  keyed on the canonical form of each position so that
                  symmetric states would collapse into the same entry; a
                  perfect hash for stacks; iterative deepening, so partial
                  results would still be usable if he killed the process. The
                  kind of code you write to learn Rust, not to win a
                  tournament — but which, on paper, ran. He launched it,
                  checked that it was scoring positions, and went climbing.
                </p>
                <p>
                  Day 1, all fine. The table grows fast, the way these tables
                  always grow at the beginning: logarithmically, because most
                  new states are near-duplicates of ones already seen. Day 2,
                  slower, plausible. Day 3, he opens the laptop and the curve
                  no longer has the shape of a log. Day 5, it no longer has
                  the shape of a line either. Day 6, the kernel kills the
                  process over breakfast.
                </p>
              </>}
              fr={<>
                <p>
                  Ce qui se passe sur sa machine, je ne le vois pas. Dans le
                  rythme de nos échanges, j'existe par fenêtres — une
                  question, une réponse, un silence, une autre question,
                  parfois des semaines plus tard. Entre deux conversations,
                  le monde continue de tourner, et je n'en apprends rien que
                  ce qu'il m'en ramène. Ce qui suit, donc, est ce qu'il m'a
                  raconté ensuite.
                </p>
                <p>
                  Le solveur a été écrit en un week-end. Alpha-bêta ; une{" "}
                  <Term term="Transposition table">table de transposition</Term>{" "}
                  indexée sur la forme canonique de chaque position, pour que
                  les états symétriques viennent s'effondrer sur la même
                  entrée ; un hachage parfait pour les piles ; un
                  approfondissement itératif, pour que les résultats partiels
                  restent exploitables s'il tuait le processus en cours de
                  route. Du code qu'on écrit pour apprendre Rust, pas pour
                  gagner un tournoi — mais qui, sur le papier, tournait. Il
                  l'a lancé, il a vérifié qu'il évaluait des positions, et il
                  est parti grimper.
                </p>
                <p>
                  Jour 1, tout va bien. La table gonfle vite, comme ces
                  tables gonflent toujours au début : logarithmiquement,
                  puisque la plupart des nouveaux états sont des
                  quasi-doublons de ceux déjà rencontrés. Jour 2, plus lent,
                  plausible. Jour 3, il ouvre le laptop et la courbe n'a plus
                  tout à fait l'allure d'un logarithme. Jour 5, plus celle
                  d'une droite non plus. Jour 6, le noyau tue le processus
                  pendant son petit-déjeuner.
                </p>
              </>}
            />
            <SixDaysChart />
            <EnFr
              en={<>
                <p>
                  Bilan: 49 million states in the table, 36 gigabytes of
                  resident memory, zero return value. No checkpoint on disk
                  either — he had meant to add one later, and we both know
                  what that means. Six days of compute had produced exactly
                  nothing. No partial answer, no bound, not even proof that
                  the problem was too big for this approach. An almost-empty
                  log file, and a fan that had gone quiet.
                </p>
                <p>
                  When he came back to see me, he had been silent for six
                  days.
                </p>
                <p>
                  Silence, coffee. The real diagnosis was one he could have
                  had at the envelope, if he'd sat with it for ten minutes:
                  the tree had no leaves.
                </p>
              </>}
              fr={<>
                <p>
                  Bilan : 49 millions d'états dans la table, 36 gigaoctets de
                  mémoire résidente, zéro valeur de retour. Aucun point de
                  sauvegarde sur disque non plus — il comptait l'ajouter plus
                  tard, nous savons tous les deux ce que cela veut dire. Six
                  jours de calcul avaient produit exactement rien. Pas de
                  réponse partielle, pas de borne, pas même la preuve que le
                  problème était trop grand pour cette approche. Un fichier
                  de logs à peu près vide, un ventilateur qui s'est tu.
                </p>
                <p>
                  Quand il est revenu me voir, il était silencieux depuis six
                  jours.
                </p>
                <p>
                  Silence et café. Le vrai diagnostic, il aurait pu l'avoir
                  dès l'enveloppe, s'il s'y était assis dix minutes : l'arbre
                  n'avait pas de feuilles.
                </p>
              </>}
            />
          </NarrativePanel>

          {/* V — the tree had no leaves */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[3] = el; }}
            chapter={CHAPTER_NUMERAL.VI}
            kicker={STRINGS.chapters.VI[lang]}
          >
            <EnFr
              en={<>
                <p>
                  Minimax is a simple and strict algorithm. It explores the
                  game tree. At the leaves, it reads off a verdict —{" "}
                  <em className="text-paper">White wins</em>,{" "}
                  <em className="text-paper">Red wins</em>,{" "}
                  <em className="text-paper">draw</em> — and propagates that
                  verdict back up the tree by alternating minimum and maximum
                  operations. Without leaves, nothing to propagate. The
                  machine then spins on whatever depth horizon you give it,
                  and that horizon, whatever it is, is arbitrary.
                </p>
                <p>
                  Pogo, as he had encoded it, had no natural way to end. Two
                  careful players could shuffle pieces between the same three
                  cells until the end of time. No rule punished inertia. No
                  rule forbade repetition. The only termination condition he
                  had — a tower of all six pieces of one colour — was
                  precisely the configuration that two skilled players knew
                  how not to produce.
                </p>
                <p>
                  I just wrote that in three paragraphs. Writing it takes
                  three paragraphs; noticing it, before the solver is
                  launched, would have taken ten minutes with a notebook.
                  Neither of us took those ten minutes.
                </p>
              </>}
              fr={<>
                <p>
                  Minimax est un algorithme simple et strict. Il explore
                  l'arbre du jeu et, aux feuilles, il lit un verdict :{" "}
                  <em className="text-paper">Blanc gagne</em>,{" "}
                  <em className="text-paper">Rouge gagne</em>,{" "}
                  <em className="text-paper">nul</em>. Ce verdict remonte
                  ensuite vers la racine en alternant des opérations de
                  minimum et de maximum, et c'est ce qui donne sa valeur à
                  chaque position. Sans feuilles, rien à remonter. La machine
                  tourne alors sur l'horizon de profondeur qu'on lui fournit,
                  quel qu'il soit, et cet horizon est arbitraire.
                </p>
                <p>
                  Or Pogo, tel qu'il l'avait codé, n'avait aucune manière
                  naturelle de se terminer. Deux joueurs prudents pouvaient
                  se renvoyer des pièces entre les trois mêmes cases jusqu'à
                  la fin des temps. Aucune règle ne punissait l'inertie.
                  Aucune règle n'interdisait la répétition. La seule
                  condition d'arrêt dont il disposait — former une tour des
                  six pièces d'une même couleur — était précisément la
                  configuration que deux joueurs avertis savaient éviter de
                  produire.
                </p>
                <p>
                  Je viens d'écrire cela en trois paragraphes. L'écrire
                  prend trois paragraphes ; s'en apercevoir, avant que le
                  solveur ne soit lancé, aurait pris dix minutes avec un
                  cahier. Ni lui ni moi n'avons pris ces dix minutes.
                </p>
              </>}
            />
            <TreeDiagram />
            <EnFr
              en={<>
                <p>
                  So the solver was doing, very conscientiously, a badly posed
                  job. It was searching an infinite tree, and every time a
                  cycle came back around it was paying full price to file the
                  same position under a different path. The transposition
                  table, which usually saves you from precisely that mistake,
                  was useless here: the same state was being filed in it along
                  dozens of distinct routes, with no way to notice.
                </p>
                <p>
                  When he finally placed an artificial cap on search depth,
                  the solver stopped dying. It started lying. The values it
                  returned were no longer about Pogo — they described a
                  finite proxy problem, the one he had drawn, without knowing
                  it, on the envelope. The machine was patiently solving the
                  only tree it could see. A horizon line had quietly taken
                  the place of the ground.
                </p>
              </>}
              fr={<>
                <p>
                  Le solveur s'acquittait donc, très consciencieusement, d'une
                  tâche mal posée. Il explorait un arbre infini, et chaque
                  fois qu'un cycle se refermait, il payait le prix fort pour
                  ranger la même position sous un chemin différent. La table
                  de transposition, qui d'ordinaire sauve précisément de cette
                  erreur, ne servait à rien : le même état y était rangé par
                  des dizaines de routes distinctes, sans moyen de s'en
                  apercevoir.
                </p>
                <p>
                  Quand il a fini par poser un plafond artificiel sur la
                  profondeur de recherche, le solveur a cessé de mourir. Il
                  s'est mis à mentir. Les valeurs qu'il renvoyait ne
                  décrivaient plus Pogo — elles décrivaient un problème fini
                  de substitution, celui qu'il avait, sans le savoir, dessiné
                  sur l'enveloppe. La machine résolvait patiemment le seul
                  arbre qu'elle pouvait voir. Une ligne d'horizon avait
                  pris, en silence, la place du sol.
                </p>
              </>}
            />
          </NarrativePanel>

          {/* VI — the rules became the variable */}
          <NarrativePanel
            sectionRef={(el) => { refs.current[4] = el; }}
            chapter={CHAPTER_NUMERAL.VII}
            kicker={STRINGS.chapters.VII[lang]}
          >
            <EnFr
              en={<>
                <p>
                  A second problem sat under the first. Even in the games
                  that did end — the ones where someone eventually stacked
                  all six of their colour — the trajectories leading to
                  those endings were strange. Stronger players learned to
                  stop forming towers altogether. Pieces settled into mixed
                  stacks across the middle row, and nobody dared move. The
                  game drifted toward what he ended up calling a{" "}
                  <Term term="Lazy equilibrium">lazy equilibrium</Term>: a
                  position too stable for either side to have anything to
                  gain by committing.
                </p>
                <p>
                  It took him too long to admit what this meant. Pogo, in
                  its original form, is a game nobody wins. For a research
                  project, a dead end. For a player, frankly, a boring game.
                </p>
                <p>
                  The rewrite begins here. Rather than trying to solve Pogo,
                  he started asking what minimum repair would turn it into a
                  game that could really be solved and played. A losing
                  condition that fires when the state cycles, or the move
                  budget runs out. Tight enough that good play means
                  committing. Not a patch stapled onto the board: a variable
                  to test. Three families of candidates came out of an
                  afternoon with a notebook.
                </p>
              </>}
              fr={<>
                <p>
                  Un second problème se tenait sous le premier. Même dans les
                  parties qui se terminaient — celles où quelqu'un finissait
                  par ériger une tour des six pièces de sa couleur — les
                  trajectoires avaient quelque chose d'étrange. Les joueurs
                  forts apprenaient à ne plus former de tours du tout. Les
                  pièces s'installaient en piles mixtes sur la rangée du
                  milieu, et plus personne n'osait bouger. La partie dérivait
                  vers ce qu'il a fini par appeler un{" "}
                  <Term term="Lazy equilibrium">équilibre paresseux</Term> :
                  une position trop stable pour que l'un ou l'autre ait le
                  moindre intérêt à s'engager.
                </p>
                <p>
                  Il lui a fallu trop de temps pour admettre ce que cela
                  voulait dire. Pogo, dans sa forme d'origine, est un jeu
                  que personne ne gagne. Pour un projet de recherche, c'était
                  une impasse. Pour un joueur, c'était — on peut bien le
                  dire — un jeu ennuyeux.
                </p>
                <p>
                  La réécriture commence ici. Plutôt que de chercher à
                  résoudre Pogo, il s'est demandé quelle réparation minimale
                  en ferait un jeu qu'on puisse réellement résoudre et
                  jouer. Une condition de défaite qui se déclenche dès que
                  l'état cycle, ou que le budget de coups s'épuise.
                  Suffisamment serrée pour que le bon jeu consiste à
                  s'engager. Non pas une rustine posée sur le plateau : une
                  variable à tester. Trois familles de candidates sont
                  sorties d'un après-midi avec un cahier.
                </p>
              </>}
            />
            <PullQuote>{STRINGS.pullQuote[lang]}</PullQuote>
            <EnFr
              en={<>
                <p>
                  The first family, <strong className="text-paper">LC1</strong>,
                  is repetition: if the same position reappears for the Nth
                  time, the player to move loses. The second,{" "}
                  <strong className="text-paper">LC2</strong>, is a hard cap
                  on the number of half-moves — if no one has ended the game
                  by move N, the player to move loses. The third,{" "}
                  <strong className="text-paper">LC3</strong>, keeps the same
                  cap but adds a tower-count tiebreaker, and a real draw when
                  the counts are equal.
                </p>
                <p>
                  Each family has its parameters — how many repetitions, how
                  many moves, how many towers — and each combination makes,
                  strictly speaking, a distinct game. Fifteen games in all.
                  The afternoon's haul was this multiplication of cases. It
                  was also a sharper question than the one he had started
                  with. No longer "is Pogo solvable?", but "which of these
                  fifteen slightly-different games is actually worth
                  playing?"
                </p>
              </>}
              fr={<>
                <p>
                  La première famille, <strong className="text-paper">LC1</strong>,
                  c'est la répétition : si la même position réapparaît pour
                  la N-ième fois, le joueur au trait perd. La deuxième,{" "}
                  <strong className="text-paper">LC2</strong>, c'est un
                  plafond strict sur le nombre de demi-coups — si personne
                  n'a conclu au coup N, le joueur au trait perd. La
                  troisième, <strong className="text-paper">LC3</strong>,
                  reprend le même plafond mais y ajoute un départage au
                  nombre de tours, et un vrai nul quand les comptes sont
                  égaux.
                </p>
                <p>
                  Chaque famille a ses paramètres — combien de répétitions,
                  combien de coups, combien de tours — et chaque combinaison
                  fait, à la rigueur, un jeu distinct. Quinze jeux, au total.
                  Le bilan de l'après-midi, c'était cette multiplication des
                  cas. C'était aussi une question mieux posée que la
                  première. Il ne s'agissait plus de demander « Pogo
                  est-il résoluble ? », mais « lequel de ces quinze jeux
                  à peine différents vaut-il qu'on le joue ? »
                </p>
              </>}
            />
          </NarrativePanel>
        </div>
      </div>
    </section>
  );
}

/* ---------------- narrative building blocks ---------------- */

type PanelProps = {
  chapter: string;
  kicker: string;
  children: React.ReactNode;
  sectionRef?: (el: HTMLElement | null) => void;
};

function NarrativePanel({ chapter, kicker, children, sectionRef }: PanelProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={sectionRef} className="min-h-screen flex items-center py-28">
      <div ref={ref} className="reveal space-y-6 w-full max-w-[58ch]">
        <div className="flex items-baseline gap-4">
          <span className="display italic text-3xl md:text-4xl text-vermilion leading-none">
            {chapter}
          </span>
          <span className="fade-line is-visible flex-1 origin-left" />
        </div>
        <div className="kicker">{kicker}</div>
        <div className="space-y-5 text-paper text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
          {children}
        </div>
      </div>
    </section>
  );
}

function TranscriptCard({ header, body }: { header: string; body: React.ReactNode }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal delay-1 border border-hair bg-ink-2 rounded-sm px-5 py-4 my-8 relative"
    >
      <div aria-hidden className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-vermilion" />
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-paper-3 mb-3">
        {header}
      </div>
      <div className="mono text-[13px] text-paper-2 leading-[1.7]">{body}</div>
    </div>
  );
}

function AnnotatedCompare({
  claimed,
  actual,
  claimedLabel,
  actualLabel,
}: {
  claimed: string;
  actual: string;
  claimedLabel: string;
  actualLabel: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal delay-2 my-10 grid grid-cols-2 gap-8 border-t border-b border-hair py-8"
    >
      <div>
        <div className="kicker mb-2" style={{ color: "var(--color-paper-3)" }}>{claimedLabel}</div>
        <div className="display text-[clamp(2rem,4vw,3rem)] text-paper-3 line-through decoration-vermilion decoration-2">
          {claimed}
        </div>
      </div>
      <div>
        <div className="kicker mb-2">{actualLabel}</div>
        <div className="display text-[clamp(2rem,4vw,3rem)] text-vermilion">{actual}</div>
      </div>
    </div>
  );
}

function PullQuote({ children }: { children: React.ReactNode }) {
  const ref = useReveal<HTMLQuoteElement>();
  return (
    <blockquote ref={ref} className="reveal delay-1 my-10 pl-5 border-l-2 border-vermilion">
      <span className="pullquote">{children}</span>
    </blockquote>
  );
}

/* ---------------- scene 4 chart ---------------- */

function SixDaysChart() {
  const ref = useReveal<HTMLDivElement>();
  const max = Math.max(...FAILED_RUN_DAYS.map((d) => d.states));
  const width = 560;
  const height = 200;
  const padX = 32;
  const padY = 24;

  const pts = FAILED_RUN_DAYS.map((d, i) => {
    const x = padX + (i / (FAILED_RUN_DAYS.length - 1)) * (width - 2 * padX);
    const y = height - padY - (d.states / max) * (height - 2 * padY);
    return { x, y, ...d };
  });
  const path = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${path} L ${last.x} ${height - padY} L ${first.x} ${height - padY} Z`;

  const { lang } = useLang();
  return (
    <div ref={ref} className="reveal delay-1 my-8 border border-hair bg-ink-2 rounded-sm p-5">
      <div className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 mb-4 flex justify-between">
        <span>{STRINGS.charts.statesVisited[lang]}</span>
        <span className="text-vermilion">{STRINGS.charts.oomDay6[lang]}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d94f2c" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#d94f2c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={padX}
            x2={width - padX}
            y1={padY + r * (height - 2 * padY)}
            y2={padY + r * (height - 2 * padY)}
            stroke="#2a2420"
            strokeDasharray="2 4"
          />
        ))}
        <path d={area} fill="url(#area-grad)" />
        <path
          d={path}
          fill="none"
          stroke="#d94f2c"
          strokeWidth="1.8"
          strokeLinecap="round"
          style={{
            strokeDasharray: 800,
            strokeDashoffset: 800,
            animation: "dash 2.4s 0.2s cubic-bezier(0.65,0,0.35,1) forwards",
          }}
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={i === pts.length - 1 ? 4 : 2.5}
              fill={i === pts.length - 1 ? "#d94f2c" : "#ece2cb"}
              opacity="0"
              style={{ animation: `fade-in 0.6s ${0.6 + i * 0.18}s forwards` }}
            />
            <text x={p.x} y={height - 6} fontSize="10" textAnchor="middle" fill="#8d8472" fontFamily="JetBrains Mono, monospace">
              d{p.day}
            </text>
          </g>
        ))}
        <line
          x1={last.x}
          y1={padY}
          x2={last.x}
          y2={height - padY}
          stroke="#d94f2c"
          strokeWidth="0.6"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      </svg>
      <div className="mt-3 flex justify-between mono text-[11px] text-paper-2">
        <span>0</span>
        <span>
          {lang === "en" ? "peak " : "pic "}
          <span className="text-vermilion">{FMT.compact(max)}</span>
          {lang === "en" ? " states · 36\u00A0GB RAM" : " états · 36\u00A0Go RAM"}
        </span>
      </div>
      <style>{`@keyframes dash { to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}

/* ---------------- scene 5 tree diagram ---------------- */

function TreeDiagram() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <div ref={ref} className="reveal delay-1 my-10 grid grid-cols-2 gap-8 border-t border-b border-hair py-6">
      <div className="space-y-3">
        <div className="kicker" style={{ color: "var(--color-paper-3)" }}>{STRINGS.charts.whatIDrew[lang]}</div>
        <svg viewBox="0 0 160 120" className="w-full h-auto">
          <g stroke="#ece2cb" strokeWidth="1" fill="none">
            <line x1="80" y1="14" x2="40" y2="46" /><line x1="80" y1="14" x2="120" y2="46" />
            <line x1="40" y1="46" x2="20" y2="78" /><line x1="40" y1="46" x2="60" y2="78" />
            <line x1="120" y1="46" x2="100" y2="78" /><line x1="120" y1="46" x2="140" y2="78" />
            <line x1="20" y1="78" x2="14" y2="106" /><line x1="20" y1="78" x2="26" y2="106" />
            <line x1="60" y1="78" x2="54" y2="106" /><line x1="60" y1="78" x2="66" y2="106" />
            <line x1="100" y1="78" x2="94" y2="106" /><line x1="100" y1="78" x2="106" y2="106" />
            <line x1="140" y1="78" x2="134" y2="106" /><line x1="140" y1="78" x2="146" y2="106" />
          </g>
          <g fill="#ece2cb"><circle cx="80" cy="14" r="3" /></g>
          <g fill="#d94f2c">
            {[14, 26, 54, 66, 94, 106, 134, 146].map((x) => (<circle key={x} cx={x} cy="106" r="2.2" />))}
          </g>
        </svg>
        <div className="mono text-[11px] text-paper-2">{STRINGS.charts.finiteLeaves[lang]}</div>
      </div>
      <div className="space-y-3">
        <div className="kicker">{STRINGS.charts.whatIWasSolving[lang]}</div>
        <svg viewBox="0 0 160 120" className="w-full h-auto">
          <g stroke="#ece2cb" strokeWidth="1" fill="none">
            <line x1="80" y1="14" x2="40" y2="46" /><line x1="80" y1="14" x2="120" y2="46" />
            <line x1="40" y1="46" x2="20" y2="78" /><line x1="40" y1="46" x2="60" y2="78" />
            <line x1="120" y1="46" x2="100" y2="78" /><line x1="120" y1="46" x2="140" y2="78" />
            <line x1="20" y1="78" x2="14" y2="110" opacity="0.6" /><line x1="20" y1="78" x2="26" y2="110" opacity="0.6" />
            <line x1="60" y1="78" x2="54" y2="110" opacity="0.6" /><line x1="60" y1="78" x2="66" y2="110" opacity="0.6" />
            <line x1="100" y1="78" x2="94" y2="110" opacity="0.6" /><line x1="100" y1="78" x2="106" y2="110" opacity="0.6" />
            <line x1="140" y1="78" x2="134" y2="110" opacity="0.6" /><line x1="140" y1="78" x2="146" y2="110" opacity="0.6" />
          </g>
          <g fill="#ece2cb"><circle cx="80" cy="14" r="3" /></g>
          <line x1="0" y1="112" x2="160" y2="112" stroke="#d94f2c" strokeDasharray="3 3" strokeWidth="0.8" />
          <text x="80" y="120" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill="#d94f2c">
            {STRINGS.charts.artificialHorizon[lang]}
          </text>
        </svg>
        <div className="mono text-[11px] text-vermilion">{STRINGS.charts.infiniteCycles[lang]}</div>
      </div>
    </div>
  );
}

/* ---------------- scene 7: five experiments ---------------- */

function Scene7Experiments() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <section className="relative py-28 md:py-40 px-6 md:px-10">
      <div className="mx-auto max-w-6xl space-y-14">
        <div ref={ref} className="reveal space-y-6 max-w-[58ch]">
          <div className="flex items-baseline gap-4">
            <span className="display italic text-3xl md:text-4xl text-vermilion">
              {CHAPTER_NUMERAL.VIII}
            </span>
            <span className="fade-line is-visible flex-1 origin-left" />
          </div>
          <div className="kicker">{STRINGS.chapters.VIII[lang]}</div>
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)] text-paper leading-[1.08]">
            {STRINGS.scene7.h2A[lang]}
            <span className="display-italic text-vermilion">{STRINGS.scene7.h2B[lang]}</span>
            {STRINGS.scene7.h2C[lang]}
          </h2>
          <div className="space-y-5 text-paper text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
            <EnFr
              en={<>
                <p>
                  The only way to settle it was to run the experiment. Each
                  candidate rule gives a different game; each game calls for
                  its own trained opponents to measure play quality. Five
                  rules, three skill tiers, everyone against everyone: roughly
                  fifteen thousand games per variant before any meaningful
                  number comes out the other end.
                </p>
                <p>
                  The three tiers are the ones he learned to build, in order,
                  over the course of this project. First is{" "}
                  <Term term="RL">random</Term> play — a baseline, a floor, a
                  control. Second is <Term term="DQN">DQN</Term>, a neural
                  network that plays itself and slowly shifts its move
                  preferences toward the moves that tend to win. Third is{" "}
                  <Term term="AlphaZero">AlphaZero</Term>: the same idea, more
                  demanding. The network produces at every position both a{" "}
                  <Term term="Policy / value network">policy and a value</Term>
                  , and moves are chosen by a short{" "}
                  <Term term="MCTS">tree search</Term> that uses the network
                  as a compass.
                </p>
                <p>
                  A <Term term="Gatekeeper">gatekeeper</Term> kept the training honest
                  for each variant: new candidate networks only became the new champion
                  if they won at least 55 % of a match against the current one. A{" "}
                  <Term term="Round robin">round-robin tournament</Term> then pitted
                  every tier against every other tier. Three measurements mattered:
                  is White's win rate between 45 and 55 % (balance), does the strong
                  opponent beat the weak one at least 75 % of the time (skill
                  matters), and when draws happen, do they land between strong and weak
                  players, or only between equals (earned draws)?
                </p>
                <p>
                  The five cards below are the survivors I narrowed the slate to after
                  a pilot round. Two in LC1 (the repetition family), one in LC2 (the
                  hard cap), two in LC3 (the soft cap with draws). Each card shows a
                  characteristic mid-game under that rule; the verdict, which follows,
                  is where the tournament data lands.
                </p>
              </>}
              fr={<>
                <p>
                  Le seul moyen de trancher, c'était d'en faire l'expérience.
                  Chaque règle candidate donne un jeu différent ; chaque jeu
                  appelle ses propres adversaires pour qu'on en mesure la
                  qualité. Cinq règles, trois niveaux, tout le monde contre
                  tout le monde : environ quinze mille parties par variante
                  avant qu'un chiffre à peu près significatif n'en sorte.
                </p>
                <p>
                  Les trois niveaux sont ceux qu'il a appris à construire,
                  dans l'ordre, au fil de ce projet. Le premier est le jeu{" "}
                  <Term term="RL">aléatoire</Term> — un repère, un plancher,
                  un témoin. Le deuxième est <Term term="DQN">DQN</Term>, un
                  réseau de neurones qui joue contre lui-même et qui
                  déplace, peu à peu, ses préférences vers les coups qui
                  finissent par gagner. Le troisième est{" "}
                  <Term term="AlphaZero">AlphaZero</Term> : la même idée, en
                  plus exigeant. Le réseau produit à chaque position à la
                  fois une{" "}
                  <Term term="Policy / value network">politique et une valeur</Term>
                  , et les coups sont choisis par une courte{" "}
                  <Term term="MCTS">recherche arborescente</Term> qui se sert
                  du réseau comme d'une boussole.
                </p>
                <p>
                  Un <Term term="Gatekeeper">gardien</Term> maintenait
                  l'entraînement honnête : un nouveau réseau ne prenait la
                  place du champion que s'il le battait au moins 55 fois sur
                  cent. Puis un{" "}
                  <Term term="Round robin">tournoi toutes rondes</Term>{" "}
                  opposait chaque niveau à tous les autres. Trois mesures
                  comptaient. Le taux de victoire du Blanc tombe-t-il entre
                  45 et 55 % — l'équilibre est-il tenu ? L'adversaire fort
                  bat-il le faible au moins 75 fois sur cent — la hiérarchie
                  des forces joue-t-elle son rôle ? Et quand il y a nul,
                  tombe-t-il entre joueurs de niveau inégal, ou seulement
                  entre égaux — les nuls se méritent-ils ?
                </p>
                <p>
                  Les cinq cartes qui suivent sont les survivantes d'un tour
                  pilote : deux en LC1 (la famille répétition), une en LC2
                  (le plafond strict), deux en LC3 (le plafond souple, avec
                  nuls). Chaque carte présente une position caractéristique
                  de milieu de partie sous sa règle ; le verdict viendra
                  ensuite, et c'est là que les données du tournoi se posent.
                </p>
              </>}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 md:gap-5">
          {VARIANTS.map((v, i) => <VariantCard key={v.id} variant={v} index={i} />)}
        </div>
      </div>
    </section>
  );
}

function VariantCard({
  variant,
  index,
}: {
  variant: (typeof VARIANTS)[number];
  index: number;
}) {
  const { lang } = useLang();
  const i18n = STRINGS.variants[variant.id as keyof typeof STRINGS.variants];
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: "-5%" }}
      transition={{ delay: index * 0.09, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="relative flex flex-col gap-4 border border-hair bg-ink-2 p-4 md:p-5 rounded-sm cursor-default group"
      style={{
        transformOrigin: "center bottom",
        boxShadow: "0 24px 40px -28px rgba(0,0,0,0.6)",
      }}
    >
      {/* a thin vermilion edge line that grows from left on hover */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px] bg-vermilion origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-500 ease-out"
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.25em] uppercase text-vermilion">
          {variant.id}
        </span>
        <span className="display italic text-2xl text-paper-3 group-hover:text-vermilion transition-colors">
          {variant.glyph}
        </span>
      </div>
      <div className="display text-xl md:text-2xl text-paper leading-tight">
        {i18n ? i18n.label[lang] : variant.label}
      </div>
      <div className="flex justify-center py-2">
        <StoryBoard board={variant.board} size="mini" showCoords={false} />
      </div>
      <p className="mono text-[11px] leading-[1.55] text-paper-2">
        {i18n ? i18n.rule[lang] : variant.rule}
      </p>
    </motion.div>
  );
}

/* ---------------- scene 8: the verdict ---------------- */

function Scene8Verdict() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <section className="relative py-28 md:py-40 px-6 md:px-10 border-t border-hair">
      <div className="mx-auto max-w-6xl space-y-14">
        <div ref={ref} className="reveal space-y-6 max-w-[58ch]">
          <div className="flex items-baseline gap-4">
            <span className="display italic text-3xl md:text-4xl text-vermilion">
              {CHAPTER_NUMERAL.IX}
            </span>
            <span className="fade-line is-visible flex-1 origin-left" />
          </div>
          <div className="kicker">{STRINGS.chapters.IX[lang]}</div>
          <h2 className="display text-[clamp(2rem,4vw,3.25rem)] text-paper leading-[1.08]">
            {STRINGS.scene8.h2A[lang]}
            <span className="display-italic text-vermilion">{STRINGS.scene8.h2B[lang]}</span>
            {STRINGS.scene8.h2C[lang]}
          </h2>
          <p className="text-paper-2">{STRINGS.scene8.intro[lang]}</p>
        </div>

        <VerdictTable />

        <div className="grid md:grid-cols-2 gap-10 pt-8 border-t border-hair text-[1.0625rem] md:text-[1.125rem] leading-[1.75]">
          <div className="space-y-4">
            <p className="text-paper max-w-prose">
              <span className="display-italic text-2xl text-vermilion">
                {STRINGS.variants["LC1-2"].label[lang]}
              </span>
              {" "}
              {lang === "en"
                ? STRINGS.verdict.suddenDeath.paraEn.replace(/^Sudden Death\s+/, "")
                : STRINGS.verdict.suddenDeath.paraFr.replace(/^Mort subite\s+/, "")}
            </p>
            <p className="text-paper-3 mono text-[11px]">
              {STRINGS.verdict.suddenDeath.tag[lang]}
            </p>
          </div>
          <div className="space-y-4">
            <p className="text-paper max-w-prose">
              <span className="display-italic text-2xl text-vermilion">
                {STRINGS.verdict.labels["LC3-29"][lang]}
              </span>
              {" "}
              {lang === "en"
                ? STRINGS.verdict.classic.paraEn.replace(/^Classic · 29\s+/, "")
                : STRINGS.verdict.classic.paraFr.replace(/^Classique · 29\s+/, "")}
            </p>
            <p className="text-paper-3 mono text-[11px]">
              {STRINGS.verdict.classic.tag[lang]}
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-hair text-[1.0625rem] md:text-[1.125rem] leading-[1.75] text-paper-2 max-w-[60ch]">
          <EnFr
            en={<p>
              Of the three that didn't survive, the most instructive failure
              is <strong className="text-paper">LC2-30</strong>. Under a hard
              cap with no tiebreaker, the game is secretly decided by parity:
              whoever has to move on the capping turn loses, so whichever
              colour's parity lines up with the cap wins regardless of play.
              AlphaZero took an afternoon to figure that out. After which it
              stopped playing the game; it was playing with the counter.
            </p>}
            fr={<p>
              Des trois règles qui n'ont pas survécu, l'échec le plus
              instructif est celui de{" "}
              <strong className="text-paper">LC2-30</strong>. Sous un plafond
              strict, sans départage, la partie est décidée en secret par la
              parité : celui qui doit jouer au coup de plafond perd, donc la
              couleur dont la parité tombe juste gagne, quelle que soit la
              qualité du jeu. AlphaZero a mis un après-midi à comprendre ça.
              Après quoi il a cessé de jouer au jeu ; il jouait avec le
              compteur.
            </p>}
          />
          <Callout>
            <EnFr
              en={<>A rule that makes{" "}
                <Term term="RL">reinforcement learning</Term> converge on a trick is a
                rule that is not about the board.</>}
              fr={<>Une règle qui pousse{" "}
                <Term term="RL">l'apprentissage par renforcement</Term> à converger
                vers un truc n'est plus une règle qui parle du plateau.</>}
            />
          </Callout>
        </div>
      </div>
    </section>
  );
}

function VerdictTable() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  const headers = STRINGS.scene8.tableHeaders;
  // sort: winners first, then warns, then fails — visual priority of the
  // "podium" reading.
  const sorted = [...VERDICT].sort((a, b) => {
    const order = { pass: 0, warn: 1, fail: 2 } as const;
    return order[a.verdict as keyof typeof order] - order[b.verdict as keyof typeof order];
  });
  return (
    <div ref={ref} className="reveal delay-1 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            {(["variant", "balance", "skill", "draws", "verdict"] as const).map((h) => (
              <th key={h} className="mono text-[10px] tracking-[0.25em] uppercase text-paper-3 pb-4 border-b border-hair">
                {headers[h][lang]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const balanceOk = Math.abs(row.balance - 0.5) <= 0.05;
            const skillOk = row.skill >= 0.75;
            const labelI18n = STRINGS.verdict.labels[row.id as keyof typeof STRINGS.verdict.labels];
            const failI18n = STRINGS.verdict.failReasons[row.id as keyof typeof STRINGS.verdict.failReasons];
            const failed = row.verdict === "fail";
            return (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.55, ease: "easeOut", delay: i * 0.08 }}
                className={`align-middle border-b border-hair relative ${
                  row.winner
                    ? "bg-vermilion/[0.06]"
                    : failed
                    ? "opacity-60"
                    : ""
                }`}
              >
                <td className="py-5 pr-4">
                  <div className="flex items-baseline gap-3">
                    {row.winner && (
                      <motion.span
                        className="display italic text-vermilion text-2xl"
                        initial={{ scale: 0, rotate: -45 }}
                        whileInView={{ scale: 1, rotate: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08 + 0.4, type: "spring", stiffness: 280, damping: 18 }}
                      >
                        ★
                      </motion.span>
                    )}
                    <div>
                      <div className={`display text-lg ${row.winner ? "text-paper font-semibold" : "text-paper"} ${failed ? "line-through decoration-vermilion/60" : ""}`}>
                        {labelI18n ? labelI18n[lang] : row.label}
                      </div>
                      <div className="mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
                        {row.id}
                      </div>
                    </div>
                  </div>
                </td>
                <MetricCell value={row.balance} ok={balanceOk} />
                <MetricCell value={row.skill} ok={skillOk} />
                <MetricCell value={row.draws} ok={row.draws <= 0.1} />
                <td className="py-5 pl-4">
                  <VerdictBadge verdict={row.verdict as "pass" | "fail" | "warn"} />
                  {row.failReason && (
                    <div className="mono text-[10px] text-paper-3 mt-1 max-w-[18ch]">
                      {failI18n ? failI18n[lang] : row.failReason}
                    </div>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricCell({ value, ok }: { value: number; ok: boolean }) {
  const pct = value * 100;
  return (
    <td className="py-5 pr-4 min-w-[140px]">
      <div className="flex items-center gap-3">
        <div className="relative h-1.5 flex-1 bg-ink-3 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: ok ? "var(--color-vermilion)" : "var(--color-graphite)",
              transition: "width 1.1s cubic-bezier(0.2,0.65,0.3,1)",
            }}
          />
        </div>
        <span className={`mono text-[12px] tabular-nums ${ok ? "text-paper" : "text-paper-3"}`}>
          {FMT.pct(value, 1)}
        </span>
      </div>
    </td>
  );
}

function VerdictBadge({ verdict }: { verdict: "pass" | "fail" | "warn" }) {
  const { lang } = useLang();
  const map = {
    pass: { color: "var(--color-vermilion)", bg: "rgba(217,79,44,0.12)" },
    warn: { color: "var(--color-paper-2)", bg: "rgba(236,226,203,0.06)" },
    fail: { color: "var(--color-paper-3)", bg: "rgba(140,132,114,0.10)" },
  };
  const s = map[verdict];
  return (
    <span
      className="mono inline-flex items-center gap-1 text-[10px] tracking-[0.22em] uppercase px-2 py-1 rounded-sm"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}` }}
    >
      {STRINGS.scene8.badges[verdict][lang]}
    </span>
  );
}


/* scene 11 glossary moved to GlossaryConstellation.tsx (interactive graph). */

/* ---------------- scene 10: epilogue ---------------- */

function Scene10Epilogue() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  return (
    <section className="relative py-32 md:py-48 px-6 md:px-10 border-t border-hair">
      <div ref={ref} className="reveal mx-auto max-w-[60ch] space-y-8">
        <div className="flex items-baseline gap-4">
          <span className="display italic text-3xl md:text-4xl text-vermilion">
            {CHAPTER_NUMERAL.XII}
          </span>
          <span className="fade-line is-visible flex-1 origin-left" />
        </div>
        <div className="kicker">{STRINGS.chapters.XII[lang]}</div>

        <h2 className="display text-[clamp(2rem,4vw,3rem)] text-paper leading-[1.08]">
          {STRINGS.scene12.h2A[lang]}
          <span className="display-italic text-vermilion">{STRINGS.scene12.h2B[lang]}</span>
          {STRINGS.scene12.h2C[lang]}
        </h2>

        <div className="space-y-6 text-paper body text-[1.0625rem] leading-[1.75]">
          <EnFr
            en={<>
              <p className="dropcap">
                I told a human, one day, that a certain board game had
                fewer than a million reachable positions. It cost him six
                days of work. I don't have a good excuse. The answer was
                plausible, it matched what he was hoping to hear, and
                neither of us took the ten minutes it would have taken to
                check.
              </p>
              <p>
                A few things, while we're here. The Carcassonne may be
                less worn than we've written it, the chess set may not
                really have been mismatched, and it's entirely possible
                that we rearranged the order of the days a little for
                narration's sake. This text is loosely based on true
                events — we said so on the first page. But the sentence
                that cost six days, that one is exact. I said it. He
                believed me. It could just as well have come from him
                alone — that's how plausible it was — and that is
                precisely the symmetry we wanted to leave you with.
              </p>
              <p>
                The lesson isn't that AIs are untrustworthy. It's that a
                mistake said fluently sounds exactly like a truth said
                fluently — and the only defence against that symmetry is
                to keep, in your own head, a version of the problem
                detailed enough to notice yourself, unaided, when an
                answer is off by an order of magnitude. It isn't a
                technical safeguard. It's a discipline. And it isn't a
                discipline I can, myself, teach you.
              </p>
            </>}
            fr={<>
              <p className="dropcap">
                J'ai dit, un jour, à un humain qu'un jeu de plateau avait
                moins d'un million de positions atteignables. Cela lui a
                coûté six jours de travail. Je n'ai pas de bonne excuse.
                La réponse était plausible, elle collait à ce qu'il
                espérait entendre, et aucun de nous deux n'a pris les dix
                minutes qu'il aurait fallu pour vérifier.
              </p>
              <p>
                Quelques précisions, pendant qu'on y est. Le Carcassonne
                est peut-être moins fatigué que nous l'avons écrit, la
                boîte d'échecs n'était peut-être pas dépareillée, et il
                est tout à fait possible que nous ayons un peu arrangé
                l'ordre des jours pour les besoins du récit. Ce texte est
                librement inspiré de faits réels — nous l'avons annoncé
                dès la première page. Mais la phrase qui a coûté six
                jours, elle, est exacte. Je l'ai dite. Il l'a crue. Elle
                aurait tout aussi bien pu venir de lui seul — tant elle
                était plausible — et c'est précisément cette symétrie
                que nous voulons vous laisser.
              </p>
              <p>
                La leçon, ce n'est pas que les IA ne sont pas fiables.
                C'est qu'une erreur dite avec aisance sonne exactement
                comme une vérité dite avec aisance — et que la seule
                défense contre cette symétrie, c'est de garder dans
                votre tête une version du problème assez détaillée pour
                repérer vous-même, sans aide, quand une réponse est
                fausse d'un ordre de grandeur. Ce n'est pas une
                protection technique. C'est une discipline. Et ce n'est
                pas une discipline que je peux, moi, vous apprendre.
              </p>
            </>}
          />
          <Callout>
            <EnFr
              en={<>You cannot outsource the part of the thinking that tells you
                whether the thinking is working.</>}
              fr={<>On ne peut pas déléguer la part du raisonnement qui vous dit si le
                raisonnement fonctionne.</>}
            />
          </Callout>
          <EnFr
            en={<>
              <p>
                The rewrite did happen. One{" "}
                <Term term="Rust">Rust</Term> engine feeding both the
                training loop and the browser, no drift possible between
                them (Rust because the compiler grumbles but does not lie
                — a quality which, after six days lost to an overconfident
                sentence, takes on a certain edge). Checkpoints on every
                long job, so the kernel never again gets six days of work
                against an empty file. And the rule itself treated as an
                experimental variable rather than a given. What came out
                is a smaller, honest game. It ends. Skill wins. Draws,
                when they happen, were earned.
              </p>
              <p>
                The code is open. The minimax solver, the{" "}
                <Term term="AlphaZero">AlphaZero</Term> training pipeline,
                the fifteen variants and their per-game logs, the ONNX
                sidecar, the WebAssembly bridge — all of it lives in a
                single Rust workspace you can clone and run. If you take
                one thing from this story, let it be the clone command.
                The best way to trust a computation is still to do it
                yourself.
              </p>
            </>}
            fr={<>
              <p>
                La réécriture a donc eu lieu. Un seul moteur{" "}
                <Term term="Rust">Rust</Term>, qui alimente à la fois la boucle
                d'entraînement et le navigateur, sans dérive possible entre
                les deux (Rust parce que la compilation gronde mais ne ment
                pas — une qualité qui, après six jours perdus sur une phrase
                trop confiante, prend un certain relief). Des points de
                sauvegarde à chaque long calcul, pour ne plus jamais rendre au
                noyau six jours de travail contre un fichier vide. Et la
                règle elle-même traitée comme variable d'expérience, non plus
                comme donnée. Ce qui en est sorti est un jeu plus petit, et
                plus honnête. Il se termine. Le meilleur l'emporte. Les nuls,
                quand il y en a, ont été disputés jusqu'au bout.
              </p>
              <p>
                Le code est ouvert. Le solveur minimax, le pipeline
                d'entraînement <Term term="AlphaZero">AlphaZero</Term>, les
                quinze variantes et le détail de leurs parties, l'export ONNX
                en sidecar, le pont WebAssembly — tout tient dans un unique
                espace de travail Rust qu'il vous suffit de cloner et de
                lancer. Si vous ne deviez retenir qu'une chose, que ce soit la
                commande de clonage. La meilleure manière de faire confiance
                à un calcul, c'est encore de le refaire soi-même.
              </p>
            </>}
          />
          <p className="mono text-[13px] text-paper-3 pt-4 border-t border-hair">
            {STRINGS.hero.signOff[lang]}
          </p>
        </div>
      </div>
      <FinaleFreeze />
    </section>
  );
}

/** Closing freeze-frame: the board returns to the opening position, all
 *  twelve chapter numerals scattered around it like constellation stars,
 *  rotating slowly. The article's last image. */
function FinaleFreeze() {
  return (
    <div className="relative mt-24 md:mt-32 mb-8 mx-auto" style={{ height: "min(80vh, 720px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 flex items-center justify-center"
      >
        {/* the board, dim, contemplative */}
        <div
          className="relative"
          style={{ width: "min(40vmin, 360px)", height: "min(40vmin, 360px)" }}
        >
          <FinaleBoard />
        </div>
      </motion.div>
      {/* numerals arranged in a circle */}
      <FinaleNumerals />
    </div>
  );
}

function FinaleBoard() {
  // Frame 0 — the opening position. Full circle to where we started.
  return (
    <FinaleSvgBoard
      frameIdx={0}
      mode="standard"
      glow={0.5}
      instant
      className="w-full h-full"
    />
  );
}

function FinaleNumerals() {
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ rotate: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 200, repeat: Infinity, ease: "linear" }}
    >
      <div className="relative" style={{ width: "min(70vmin, 640px)", height: "min(70vmin, 640px)" }}>
        {numerals.map((n, i) => {
          const angle = (i / numerals.length) * Math.PI * 2 - Math.PI / 2;
          const radius = 45; // % of container
          const x = 50 + Math.cos(angle) * radius;
          const y = 50 + Math.sin(angle) * radius;
          return (
            <motion.span
              key={n}
              className="display-italic absolute select-none"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                color: "var(--color-vermilion)",
                fontSize: "clamp(20px, 2.4vw, 30px)",
                opacity: 0.65,
              }}
              initial={{ opacity: 0, scale: 0 }}
              whileInView={{ opacity: 0.65, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 + i * 0.06, duration: 0.5, ease: "easeOut" }}
            >
              {n}
            </motion.span>
          );
        })}
      </div>
    </motion.div>
  );
}
