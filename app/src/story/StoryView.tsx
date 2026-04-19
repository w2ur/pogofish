import { useEffect, useState } from "react";
import { StoryBoard } from "./StoryBoard";
import { Term } from "./Term";
import { TryYourself } from "./TryYourself";
import { PlayScene } from "./PlayScene";
import { PlayCTA } from "./PlayCTA";
import { Callout } from "./Callout";
import { EnFr } from "./EnFr";
import { LearningsScene } from "./LearningsScene";
import { LangToggle } from "./LangToggle";
import { useLang } from "./LangContext";
import { STRINGS, tf } from "./i18n";
import { useReveal, useActiveIndex } from "./useReveal";
import {
  HERO_SEQUENCE,
  PINNED_BOARDS,
  VARIANTS,
  FAILED_RUN_DAYS,
  VERDICT,
  GLOSSARY,
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
    <div className="story story-grain story-noise min-h-screen">
      <StoryChrome />
      <Scene1Hook />
      <TryYourself />
      <PinnedStory />
      <Scene7Experiments />
      <Scene8Verdict />
      <PlayScene />
      <LearningsScene />
      <Scene10Epilogue />
      <Scene11Glossary />
      <StoryFooter />
      <PlayCTA />
      <LangToggle />
    </div>
  );
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
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 md:px-10 md:py-5 pointer-events-none"
      style={{
        background:
          "linear-gradient(180deg, rgba(18,16,14,0.92) 0%, rgba(18,16,14,0.6) 60%, rgba(18,16,14,0) 100%)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
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

/* ---------------- scene 1: hook ---------------- */

function Scene1Hook() {
  const { lang } = useLang();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % HERO_SEQUENCE.length);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const current = HERO_SEQUENCE[frame] ?? HERO_SEQUENCE[0]!;

  return (
    <section className="relative flex min-h-screen w-full flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 35%, rgba(217,79,44,0.10), transparent 75%)",
        }}
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-10 lg:gap-16">
        <div className="order-2 lg:order-1 text-left lg:text-right space-y-6">
          <div className="kicker">{CHAPTER_NUMERAL.I} &middot; {STRINGS.chapters.I[lang]}</div>
          <h1 className="display text-[clamp(2.6rem,6.5vw,5.2rem)] text-paper">
            {STRINGS.hero.titleA[lang]}
            <span className="display-italic text-vermilion">{STRINGS.hero.titleB[lang]}</span>
            {STRINGS.hero.titleC[lang]}
          </h1>
          <p className="body text-paper-2 max-w-md lg:ml-auto">
            <EnFr
              en={<>A question I could not answer with a minimax solver. A rewrite that turned into a story about trusting an AI with a calculation I should have done myself.</>}
              fr={<>Une question à laquelle je n'ai pas pu répondre avec un solveur minimax. Une réécriture devenue récit sur la confiance accordée à une IA pour un calcul que j'aurais dû faire moi-même.</>}
            />
          </p>
        </div>

        <div className="order-1 lg:order-2 relative">
          <div className="relative" style={{ animation: "fade-in 1.4s ease-out both" }}>
            <StoryBoard board={current} size="large" showCoords={false} />
            <div
              aria-hidden
              className="absolute -inset-8 rounded-2xl pointer-events-none"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 50%, rgba(217,79,44,0.10), transparent 70%)",
                animation: "piece-breathe 5s ease-in-out infinite",
              }}
            />
          </div>
          <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
            {HERO_SEQUENCE.map((_, i) => (
              <span
                key={i}
                className="h-[2px] transition-all duration-500"
                style={{
                  width: i === frame ? 22 : 8,
                  background: i === frame ? "var(--color-vermilion)" : "var(--color-graphite)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="order-3 hidden lg:block" aria-hidden />
      </div>

      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 mono text-[10px] tracking-[0.35em] uppercase text-paper-3 flex flex-col items-center gap-2"
      >
        <span>{STRINGS.chrome.scroll[lang]}</span>
        <span className="h-8 w-px bg-paper-3 opacity-60" />
      </div>
    </section>
  );
}

/* ---------------- scenes 2–6: pinned sidecar ---------------- */

function PinnedStory() {
  const { lang } = useLang();
  const { refs, active } = useActiveIndex(5);
  const board = PINNED_BOARDS[active] ?? PINNED_BOARDS[0]!;
  const pinLabelKeys: (keyof typeof STRINGS.pinned.labels)[] = [
    "opening", "theClaim", "sixDays", "theRules", "equilibrium",
  ];
  const pinLabelKey = pinLabelKeys[active] ?? pinLabelKeys[0]!;
  const pinLabel = STRINGS.pinned.labels[pinLabelKey][lang];

  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[minmax(280px,_340px)_minmax(0,_1fr)] gap-10 lg:gap-20">
        {/* sticky board column */}
        <aside className="hidden lg:block">
          <div className="sticky top-0 h-screen flex flex-col items-center justify-center gap-6">
            <div className="kicker">{tf(STRINGS.pinned.positionOf[lang], { n: active + 1 })}</div>
            <StoryBoard
              key={active}
              board={board}
              size="default"
              showCoords
              style={{ animation: "fade-in 0.9s ease both" }}
            />
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
                  Pogo is a real board game. I did not invent it; I found it on a shelf in
                  a friend's flat, sat through one round, and then lay awake that night
                  turning it over in my head. Three rows by three columns. Twelve pieces.
                  A single rule for how stacks of pieces travel. No dice, no cards, no
                  hidden information. A game you could fit, piece by piece, into your
                  head.
                </p>
                <p>
                  The rule is almost insultingly simple. Pick up a tower of one, two, or
                  three pieces from a cell where your colour is on top. Move it in a
                  straight line whose length is <Term term="Manhattan distance">determined
                  by the count</Term> &mdash; one piece travels one cell, two pieces travel
                  two, three pieces travel one or three. Drop the tower on top of
                  whatever is already on the target cell. Repeat until the losing
                  condition fires. The game fits on a napkin.
                </p>
                <p>
                  The napkin made it look like a good problem for a small experiment. I
                  had been reading about <Term term="RL">reinforcement learning</Term>
                  {" "}and wanted to train an agent on something I could verify by brute
                  force. Pogo looked perfect: small enough to solve exactly with
                  <Term term="Minimax"> minimax</Term>, small enough to run self-play in
                  a corner of a laptop, and novel enough that no public code would leak
                  into training.
                </p>
                <p>
                  I pictured a neat parallel run. Build the solver, compute the true
                  value of every reachable state, then train a neural network and
                  measure how quickly it caught up.
                </p>
              </>}
              fr={<>
                <p className="dropcap">
                  Pogo est un vrai jeu de plateau. Je ne l'ai pas inventé ; je l'ai
                  trouvé sur une étagère chez un ami, j'ai assisté à une partie, et
                  je suis resté éveillé cette nuit-là à le retourner dans ma tête.
                  Trois lignes par trois colonnes. Douze pièces. Une seule règle pour
                  dire comment les piles de pièces se déplacent. Ni dés, ni cartes,
                  ni information cachée. Un jeu qu'on peut loger, pièce par pièce,
                  dans sa tête.
                </p>
                <p>
                  La règle est d'une simplicité presque insultante. Prenez une tour
                  d'une, deux ou trois pièces sur une case où votre couleur est au
                  sommet. Déplacez-la en ligne droite sur une distance{" "}
                  <Term term="Manhattan distance">fixée par le nombre de pièces</Term>
                  {" "}— une pièce parcourt une case, deux pièces en parcourent deux,
                  trois pièces en parcourent une ou trois. Posez la tour sur ce qui
                  se trouve déjà sur la case d'arrivée. Recommencez jusqu'à ce que la
                  condition de défaite se déclenche. Le jeu tient sur une serviette.
                </p>
                <p>
                  La serviette faisait ressembler le problème à un bon petit sujet
                  d'expérience. Je venais de lire sur{" "}
                  <Term term="RL">l'apprentissage par renforcement</Term>{" "}et je
                  voulais entraîner un agent sur quelque chose que je pourrais
                  vérifier par force brute. Pogo semblait parfait : assez petit pour
                  être résolu exactement avec <Term term="Minimax"> minimax</Term>,
                  assez petit pour faire du self-play dans un coin de laptop, et
                  assez nouveau pour qu'aucun code public ne fuite dans
                  l'entraînement.
                </p>
                <p>
                  J'imaginais un parcours parallèle bien propre. Écrire le solveur,
                  calculer la vraie valeur de chaque état atteignable, puis entraîner
                  un réseau de neurones et mesurer à quelle vitesse il rattrapait.
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
              en={<p>I started, as I often do, by asking an AI how big the problem was.</p>}
              fr={<p>J'ai commencé, comme souvent, par demander à une IA l'ampleur du problème.</p>}
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
                Before writing a single line, I had a conversation with a chat model
                about the shape of the game tree. I wanted to know the number of
                reachable positions &mdash; a rough answer was enough. If it was in the
                millions, a minimax solver with a{" "}
                <Term term="Transposition table">transposition table</Term> would
                fit on my laptop. If it was in the billions, I needed a different plan.
              </p>}
              fr={<p>
                Avant d'écrire une seule ligne, j'ai discuté avec un modèle de chat
                de la forme de l'arbre de jeu. Je voulais connaître le nombre de
                positions atteignables — un ordre de grandeur suffisait. Si c'était
                en millions, un solveur minimax avec une{" "}
                <Term term="Transposition table">table de transposition</Term>{" "}
                tenait sur mon laptop. Si c'était en milliards, il me fallait un
                autre plan.
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
                  A million states is small. Small enough that{" "}
                  <Term term="Alpha-beta pruning">alpha-beta pruning</Term> would chew
                  through it over lunch. I did the mental sanity-check: nine cells, up to
                  twelve pieces per cell, two possible colours per slot. A very rough
                  ceiling of 2¹² × 9ʳ positions if you squint. Yes, several million.
                  Sure, maybe a bit more. Nowhere close to a problem.
                </p>
                <p>
                  I accepted the number and started building. The model had not hedged,
                  and I had not pushed. Read that exchange now and you see two
                  collaborators skipping a step together, each assuming the other had
                  done the arithmetic. The step we skipped was the one that mattered:
                  asking whether the game actually <em className="text-paper">ends</em>.
                </p>
              </>}
              fr={<>
                <p>
                  Un million d'états, c'est peu. Assez peu pour qu'un{" "}
                  <Term term="Alpha-beta pruning">élagage alpha-bêta</Term> en vienne
                  à bout entre midi et deux. J'ai fait le test mental de cohérence :
                  neuf cases, jusqu'à douze pièces par case, deux couleurs possibles
                  par emplacement. Un plafond très grossier de 2¹² × 9ʳ positions en
                  plissant les yeux. Oui, plusieurs millions. Bon, peut-être un peu
                  plus. Rien qui ressemble à un problème.
                </p>
                <p>
                  J'ai accepté le chiffre et me suis mis à construire. Le modèle
                  n'avait pas nuancé, et je n'avais pas insisté. Relisez cet échange
                  aujourd'hui et vous voyez deux collaborateurs qui sautent une étape
                  ensemble, chacun supposant que l'autre avait fait l'arithmétique.
                  L'étape qu'on a sautée est celle qui comptait : demander si le jeu{" "}
                  <em className="text-paper">se termine</em> vraiment.
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
                The true number is at least fifty times larger, and that is only
                counting states my solver reached before it ran out of memory. The real
                state space, under the game's original rules, has no upper bound at all
                &mdash; which is a different problem from being big.
              </p>}
              fr={<p>
                Le vrai chiffre est au moins cinquante fois plus grand, et encore
                ne compte-t-il que les états que mon solveur a atteints avant de
                manquer de mémoire. Le vrai espace d'états, sous les règles
                d'origine, n'a aucune borne supérieure — ce qui est un problème
                différent d'être grand.
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
                  I wrote the solver in a weekend. Alpha-beta search. A{" "}
                  <Term term="Transposition table">transposition table</Term> keyed on the
                  canonical form of a position so symmetric board states would collapse
                  into the same entry. A small perfect-hash for stacks. Iterative
                  deepening so partial results were always usable if I killed the
                  process. It ran. It scored positions. I left it running over the
                  weekend and went climbing.
                </p>
                <p>
                  Day one looked fine. The transposition table grew quickly, but it grew
                  the way these tables do &mdash; logarithmically feels right, because most
                  new states are near-duplicates of ones already seen. Day two looked
                  slower but plausible. On day three it was obvious that the log curve I
                  had been imagining was linear at best. Day five it was clearly
                  superlinear. Day six the process was killed by the kernel.
                </p>
              </>}
              fr={<>
                <p>
                  J'ai écrit le solveur en un week-end. Recherche alpha-bêta. Une{" "}
                  <Term term="Transposition table">table de transposition</Term>{" "}
                  indexée sur la forme canonique d'une position, pour que les états
                  symétriques s'effondrent sur la même entrée. Un petit hachage
                  parfait pour les piles. Approfondissement itératif, pour que les
                  résultats partiels soient toujours exploitables si je tuais le
                  processus. Il a tourné. Il a évalué des positions. Je l'ai laissé
                  tourner le week-end et je suis parti grimper.
                </p>
                <p>
                  Jour un, tout semblait bien. La table grandissait vite, mais comme
                  ces tables le font — logarithmiquement, d'instinct, puisque la
                  plupart des nouveaux états sont des quasi-doublons de ceux déjà
                  vus. Jour deux, plus lent mais plausible. Jour trois, il était
                  clair que la courbe log que j'imaginais était au mieux linéaire.
                  Jour cinq, nettement superlinéaire. Jour six, le noyau a tué le
                  processus.
                </p>
              </>}
            />
            <SixDaysChart />
            <EnFr
              en={<>
                <p>
                  Forty-nine million states in the transposition table. Thirty-six
                  gigabytes of resident memory. No return value. No checkpoint written to
                  disk &mdash; something I had decided to add later, which is another way of
                  saying never. Six days of compute had produced exactly nothing: not a
                  partial answer, not a bound, not even a proof that the problem was too
                  big to solve this way. Just an empty log file and a cold fan.
                </p>
                <p>
                  The honest reaction was a long silence and a cup of coffee. The second,
                  slightly later reaction was a realisation I should have had on the
                  napkin: the tree had no leaves.
                </p>
              </>}
              fr={<>
                <p>
                  Quarante-neuf millions d'états dans la table. Trente-six gigaoctets
                  de mémoire résidente. Aucune valeur de retour. Aucun checkpoint
                  écrit sur disque — une chose que je m'étais dit j'ajouterai plus
                  tard, ce qui est une autre façon de dire jamais. Six jours de
                  calcul avaient produit exactement rien : pas de réponse partielle,
                  pas de borne, pas même une preuve que le problème était trop grand
                  pour être résolu ainsi. Juste un log vide et un ventilateur qui
                  s'est tu.
                </p>
                <p>
                  La réaction honnête fut un long silence et une tasse de café. La
                  seconde, un peu plus tard, fut une prise de conscience que j'aurais
                  dû avoir sur la serviette : l'arbre n'avait pas de feuilles.
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
                  Minimax is a search algorithm with a strict requirement: every branch
                  of the tree must eventually end. At the leaves it reads off a verdict
                  &mdash; <em className="text-paper">White wins</em>, <em className="text-paper">Red
                  wins</em>, <em className="text-paper">draw</em> &mdash; and propagates the
                  verdict upward by alternating minimum and maximum operations. Without
                  leaves the algorithm has nothing to back up. The machine spins on
                  whatever depth horizon you give it, and that horizon is arbitrary.
                </p>
                <p>
                  Pogo, as I had encoded it, had no natural way to end. Two careful
                  players could keep shuffling pieces between the same three cells
                  forever. No rule punished stalling. No rule forbade repetition. The
                  only termination condition I had — &ldquo;a tower of all six of one colour&rdquo; —
                  was something skilled players could usually avoid creating.
                </p>
              </>}
              fr={<>
                <p>
                  Minimax est un algorithme de recherche avec une exigence stricte :
                  chaque branche de l'arbre doit finir par se terminer. Aux feuilles,
                  il lit un verdict — <em className="text-paper">Blanc gagne</em>,{" "}
                  <em className="text-paper">Rouge gagne</em>,{" "}
                  <em className="text-paper">nul</em> — et il fait remonter ce verdict
                  vers le haut en alternant des opérations min et max. Sans feuilles,
                  l'algorithme n'a rien à remonter. La machine tourne sur le
                  quelconque horizon de profondeur qu'on lui donne, et cet horizon
                  est arbitraire.
                </p>
                <p>
                  Pogo, tel que je l'avais encodé, n'avait aucune façon naturelle de
                  se terminer. Deux joueurs prudents pouvaient se renvoyer des pièces
                  entre les trois mêmes cases à l'infini. Aucune règle ne punissait
                  le blocage. Aucune règle n'interdisait la répétition. La seule
                  condition d'arrêt dont je disposais — « une tour des six pièces
                  d'une couleur » — était une configuration que les joueurs forts
                  savaient en général éviter.
                </p>
              </>}
            />
            <TreeDiagram />
            <EnFr
              en={<>
                <p>
                  So the solver was doing honest work on a dishonest problem. It was
                  searching an infinite tree, and every time a cycle came back around I
                  was paying full price to store the position again under a different
                  path. The transposition table, which usually saves you from that exact
                  mistake, was defeated because I was folding the same state into it
                  along dozens of routes.
                </p>
                <p>
                  When I dropped an artificial cap on search depth, the solver stopped
                  dying but started lying: the values it returned were about a finite
                  proxy problem, not Pogo. I had been drawing a finite tree on the
                  napkin. The machine had been patiently solving the only tree it could
                  see, with a horizon line pretending to be the ground.
                </p>
              </>}
              fr={<>
                <p>
                  Le solveur faisait donc un travail honnête sur un problème
                  malhonnête. Il cherchait dans un arbre infini, et chaque fois qu'un
                  cycle se bouclait, je payais le plein tarif pour stocker la même
                  position sous un autre chemin. La table de transposition, qui
                  d'ordinaire vous sauve de cette erreur précise, était défaite parce
                  que je pliais le même état dans la table par des dizaines de
                  routes.
                </p>
                <p>
                  Quand j'ai posé un plafond artificiel sur la profondeur de
                  recherche, le solveur a arrêté de mourir mais s'est mis à mentir :
                  les valeurs qu'il renvoyait décrivaient un problème fini de
                  substitution, pas Pogo. Je dessinais un arbre fini sur la
                  serviette. La machine, patiente, résolvait le seul arbre qu'elle
                  pouvait voir, avec une ligne d'horizon qui se prenait pour le sol.
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
                  A second problem lay underneath the first. Even in the finite games
                  that did end — the ones where someone stacked all six of their colour
                  — the play patterns leading to those endings were strange.
                  Stronger players learned to avoid forming towers at all. Pieces would
                  distribute themselves into mixed stacks across the middle row and sit
                  there, neither side willing to commit. The game would drift toward
                  what I started calling a{" "}
                  <Term term="Lazy equilibrium">lazy equilibrium</Term>: a position
                  stable enough that neither player had anything to gain by moving first.
                </p>
                <p>
                  It took me longer than it should have to accept what this meant. Pogo,
                  in its honest form, is a game nobody wins. The rules produce no
                  pressure to resolve, and a skilled pair can keep the state evolving
                  without anyone ever being forced into a losing commitment. For a
                  research project this was a dead end; for a player this was, frankly,
                  a boring game.
                </p>
                <p>
                  The rewrite began here. Instead of trying to solve Pogo I started
                  asking what minimum repair would make it a game that could actually
                  be solved and played. A losing condition that fires when the state
                  cycles or the move budget runs out — tight enough to force good play
                  into commitment. Not a patch stapled onto the board: a variable to
                  test. Three families of candidates came out of an afternoon with a
                  notebook.
                </p>
              </>}
              fr={<>
                <p>
                  Un second problème se cachait sous le premier. Même dans les
                  parties finies qui se terminaient bien — celles où quelqu'un
                  formait une tour des six pièces de sa couleur — les schémas de jeu
                  qui menaient à ces fins étaient étranges. Les joueurs forts
                  apprenaient à éviter de former des tours du tout. Les pièces se
                  répartissaient en piles mixtes sur la rangée du milieu et s'y
                  installaient, aucun camp ne voulant s'engager. La partie dérivait
                  vers ce que j'ai commencé à appeler un{" "}
                  <Term term="Lazy equilibrium">équilibre paresseux</Term> : une
                  position assez stable pour que ni l'un ni l'autre n'ait intérêt à
                  bouger le premier.
                </p>
                <p>
                  J'ai mis plus de temps que nécessaire à accepter ce que cela
                  voulait dire. Pogo, dans sa forme honnête, est un jeu que
                  personne ne gagne. Les règles ne produisent aucune pression de
                  résolution, et une paire habile peut faire évoluer l'état sans que
                  personne ne soit jamais forcé à un engagement perdant. Pour un
                  projet de recherche, c'était une impasse ; pour un joueur, c'était,
                  disons-le, un jeu ennuyeux.
                </p>
                <p>
                  La réécriture commence ici. Au lieu de chercher à résoudre Pogo,
                  j'ai commencé à me demander quelle réparation minimale en ferait
                  un jeu qu'on puisse vraiment résoudre et jouer. Une condition de
                  défaite qui se déclenche quand l'état cycle ou que le budget de
                  coups s'épuise — assez serrée pour forcer le bon jeu à s'engager.
                  Pas un rustine collé sur le plateau : une variable à tester. Trois
                  familles de candidats sont sorties d'un après-midi avec un
                  cahier.
                </p>
              </>}
            />
            <PullQuote>{STRINGS.pullQuote[lang]}</PullQuote>
            <EnFr
              en={<>
                <p>
                  The first family, <strong className="text-paper">LC1</strong>, is
                  repetition. If the same position reappears for the Nth time, the
                  player to move loses. The second, <strong className="text-paper">LC2</strong>,
                  is a hard cap on the number of half-moves: if neither side has ended
                  the game by move N, the player whose turn it is loses. The third,{" "}
                  <strong className="text-paper">LC3</strong>, is the same cap but with a
                  tower-count tiebreaker and an honest draw when the counts are equal.
                </p>
                <p>
                  Each family has parameters — how many repetitions, how many moves, how
                  many towers — and each combination is a distinct game. Fifteen games,
                  in the end. A whole afternoon's worth of experiments, and a question
                  sharper than the one I had started with: not &ldquo;is Pogo solvable?&rdquo;,
                  but &ldquo;which of these fifteen slightly-different games is actually
                  worth playing?&rdquo;
                </p>
              </>}
              fr={<>
                <p>
                  La première famille, <strong className="text-paper">LC1</strong>,
                  c'est la répétition. Si la même position réapparaît pour la Nᵉ
                  fois, le joueur au trait perd. La deuxième,{" "}
                  <strong className="text-paper">LC2</strong>, c'est un plafond
                  strict sur le nombre de demi-coups : si aucun des deux camps n'a
                  fini la partie au coup N, le joueur au trait perd. La troisième,{" "}
                  <strong className="text-paper">LC3</strong>, c'est le même plafond
                  mais avec un départage au nombre de tours et un nul honnête quand
                  les comptes sont égaux.
                </p>
                <p>
                  Chaque famille a des paramètres — combien de répétitions, combien
                  de coups, combien de tours — et chaque combinaison est un jeu
                  distinct. Quinze jeux, au total. Un après-midi entier
                  d'expériences, et une question plus aiguisée que celle par
                  laquelle j'avais commencé : non plus « Pogo est-il résoluble ? »,
                  mais « lequel de ces quinze jeux légèrement différents vaut
                  vraiment la peine qu'on le joue ? »
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
                  The only way to know was to run the actual experiment. Each candidate
                  rule is a different game, and every game needs its own trained
                  opponents to judge play quality. Five rules, three skill tiers,
                  everything playing everything: roughly fifteen thousand games of Pogo
                  per variant before any meaningful number comes out the other end.
                </p>
                <p>
                  The three skill tiers are the ones I learned to build, in order, over
                  the run of this project. The first is <Term term="RL">random</Term>{" "}
                  play &mdash; a baseline, a floor, a control. The second is{" "}
                  <Term term="DQN">DQN</Term>, a neural network trained by playing
                  itself and nudging its move preferences toward whichever moves tended
                  to win. The third is <Term term="AlphaZero">AlphaZero</Term>: the same
                  idea, but with a network that outputs both a{" "}
                  <Term term="Policy / value network">policy and a value</Term> at every
                  position and whose moves are chosen by a short{" "}
                  <Term term="MCTS">tree search</Term> that uses the network as a
                  compass.
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
                  La seule façon de savoir était de faire l'expérience. Chaque règle
                  candidate est un jeu différent, et chaque jeu demande ses propres
                  adversaires entraînés pour juger la qualité du jeu. Cinq règles,
                  trois niveaux, tout le monde contre tout le monde : environ quinze
                  mille parties de Pogo par variante avant qu'un chiffre significatif
                  n'en sorte.
                </p>
                <p>
                  Les trois niveaux sont ceux que j'ai appris à construire, dans
                  l'ordre, au fil de ce projet. Le premier est le jeu{" "}
                  <Term term="RL">aléatoire</Term> — un repère, un plancher, un
                  témoin. Le deuxième est <Term term="DQN">DQN</Term>, un réseau de
                  neurones entraîné en jouant contre lui-même et en ajustant ses
                  préférences vers les coups qui ont tendance à gagner. Le troisième
                  est <Term term="AlphaZero">AlphaZero</Term> : la même idée, mais
                  avec un réseau qui sort à la fois une{" "}
                  <Term term="Policy / value network">politique et une valeur</Term>{" "}
                  à chaque position, et dont les coups sont choisis par une courte{" "}
                  <Term term="MCTS">recherche arborescente</Term> qui utilise le
                  réseau comme boussole.
                </p>
                <p>
                  Un <Term term="Gatekeeper">gatekeeper</Term> maintenait
                  l'entraînement honnête pour chaque variante : un nouveau réseau
                  candidat ne devenait le champion que s'il gagnait au moins 55 % d'un
                  match contre le courant. Un{" "}
                  <Term term="Round robin">tournoi toutes rondes</Term> opposait
                  ensuite chaque niveau à tous les autres. Trois mesures comptaient :
                  le taux de victoire du Blanc se situe-t-il entre 45 et 55 %
                  (équilibre), l'adversaire fort bat-il le faible au moins 75 % du
                  temps (le niveau compte), et quand il y a nul, tombe-t-il entre
                  joueurs forts et faibles ou uniquement entre égaux (nuls mérités) ?
                </p>
                <p>
                  Les cinq cartes ci-dessous sont les survivantes que j'ai retenues
                  après un tour pilote. Deux en LC1 (la famille répétition), une en
                  LC2 (le plafond strict), deux en LC3 (le plafond souple avec nuls).
                  Chaque carte montre une position caractéristique de milieu de
                  partie sous cette règle ; le verdict, qui suit, est là où les
                  données du tournoi atterrissent.
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
  const ref = useReveal<HTMLDivElement>({ threshold: 0.2, rootMargin: "0px 0px -5% 0px" });
  const { lang } = useLang();
  const i18n = STRINGS.variants[variant.id as keyof typeof STRINGS.variants];
  return (
    <div
      ref={ref}
      className={`reveal delay-${Math.min(index, 4)} flex flex-col gap-4 border border-hair bg-ink-2 p-4 md:p-5 rounded-sm hover:border-vermilion/50 transition-colors`}
    >
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.25em] uppercase text-vermilion">
          {variant.id}
        </span>
        <span className="display italic text-2xl text-paper-3">{variant.glyph}</span>
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
    </div>
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
              Of the three that did not survive, the most instructive failure was{" "}
              <strong className="text-paper">LC2-30</strong>. Under a hard cap with no
              tiebreaker, the game is secretly decided by parity: whoever has to move
              on the capping turn loses, so whichever colour's parity lines up with
              the cap wins regardless of play. AlphaZero learned this within an
              afternoon of self-play, and from then on its moves mostly tried to
              burn tempo.
            </p>}
            fr={<p>
              Des trois qui n'ont pas survécu, l'échec le plus instructif est{" "}
              <strong className="text-paper">LC2-30</strong>. Sous un plafond strict
              sans départage, la partie est secrètement décidée par la parité :
              celui qui doit jouer au coup de plafond perd, donc la couleur dont la
              parité coïncide avec le plafond gagne quelle que soit la qualité du
              jeu. AlphaZero l'a compris en un après-midi de self-play, et dès lors
              ses coups se bornaient à brûler du tempo.
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
          {VERDICT.map((row, i) => {
            const balanceOk = Math.abs(row.balance - 0.5) <= 0.05;
            const skillOk = row.skill >= 0.75;
            const labelI18n = STRINGS.verdict.labels[row.id as keyof typeof STRINGS.verdict.labels];
            const failI18n = STRINGS.verdict.failReasons[row.id as keyof typeof STRINGS.verdict.failReasons];
            return (
              <tr
                key={row.id}
                className={`align-middle border-b border-hair ${row.winner ? "bg-vermilion/[0.04]" : ""}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <td className="py-5 pr-4">
                  <div className="flex items-baseline gap-3">
                    {row.winner && <span className="display italic text-vermilion text-lg">★</span>}
                    <div>
                      <div className="display text-lg text-paper">
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
              </tr>
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


/* ---------------- scene 11: glossary ---------------- */

function Scene11Glossary() {
  const ref = useReveal<HTMLDivElement>();
  const { lang } = useLang();
  const groups = (["AI", "Infra", "Pogo"] as const).map((key) => ({
    key,
    name: STRINGS.scene11.groups[key].name[lang],
    blurb: STRINGS.scene11.groups[key].blurb[lang],
  }));
  return (
    <section className="relative py-28 md:py-36 px-6 md:px-10 border-t border-hair">
      <div className="mx-auto max-w-6xl space-y-12">
        <div ref={ref} className="reveal space-y-4 max-w-[60ch]">
          <div className="kicker">{STRINGS.scene11.kicker[lang]}</div>
          <h2 className="display text-[clamp(1.9rem,3.8vw,3rem)] text-paper leading-[1.1]">
            {STRINGS.scene11.h2A[lang]}
            <span className="display-italic text-vermilion">{STRINGS.scene11.h2B[lang]}</span>
            {STRINGS.scene11.h2C[lang]}
          </h2>
          <p className="text-paper-2">{STRINGS.scene11.intro[lang]}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {groups.map((g) => (
            <div key={g.key} className="space-y-6">
              <div className="space-y-1 pb-3 border-b border-hair">
                <div className="display italic text-2xl text-vermilion">{g.name}</div>
                <div className="mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
                  {g.blurb}
                </div>
              </div>
              <dl className="space-y-5">
                {GLOSSARY.filter((e) => e.group === g.key).map((e) => (
                  <div key={e.term} className="space-y-1.5">
                    <dt className="display text-lg text-paper">
                      {lang === "fr" && e.termFr ? e.termFr : e.term}
                    </dt>
                    <dd className="text-paper-2 text-[0.95rem] leading-[1.65]">
                      {e.long[lang]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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
                I lost six days to a sentence I did not verify. The sentence came from
                an AI. It would have come from me, too, if I had not been paying
                attention &mdash; that is how plausible it was, and that is the part of
                the story I want to leave with you.
              </p>
              <p>
                The lesson is not that AIs are untrustworthy. It is that fluent
                wrongness sounds exactly like fluent rightness, and the only defence
                is to keep a version of the problem in your own head detailed enough to
                notice when the answer is off by an order of magnitude.
              </p>
            </>}
            fr={<>
              <p className="dropcap">
                J'ai perdu six jours à cause d'une phrase que je n'ai pas vérifiée.
                La phrase venait d'une IA. Elle aurait pu venir de moi aussi, si je
                n'avais pas fait attention — c'est à quel point elle était plausible,
                et c'est la part du récit que je veux vous laisser.
              </p>
              <p>
                La leçon n'est pas que les IA ne sont pas dignes de confiance. C'est
                qu'une erreur dite avec aisance sonne exactement comme une vérité
                dite avec aisance, et la seule défense est de garder en tête une
                version du problème assez détaillée pour remarquer quand la réponse
                est à un ordre de grandeur près.
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
                So the rewrite happened: one <Term term="Rust">Rust</Term> engine
                feeding both the training loop and the browser, no drift between
                them; checkpointing on every long job; the rules themselves treated
                as an experimental variable rather than a given. What came out is a
                smaller, honest game. It ends. Skill wins. Draws, when they happen,
                were fought for.
              </p>
              <p>
                The code is open. The minimax solver, the{" "}
                <Term term="AlphaZero">AlphaZero</Term> training pipeline, the fifteen
                rule variants and their per-game logs, the ONNX export sidecar, the
                WebAssembly glue &mdash; all of it lives in a single Rust workspace you
                can clone and run. If you take one thing from this story, let it be
                the clone command: the best way to trust a computation is to do it
                again yourself.
              </p>
            </>}
            fr={<>
              <p>
                La réécriture a donc eu lieu : un seul moteur <Term term="Rust">Rust</Term>{" "}
                nourrissant à la fois la boucle d'entraînement et le navigateur,
                aucune dérive entre les deux ; des checkpoints sur chaque long travail ;
                les règles elles-mêmes traitées comme variable expérimentale plutôt
                que comme donnée. Ce qui en est sorti est un jeu plus petit, honnête.
                Il se termine. Le niveau gagne. Les nuls, quand il y en a, se sont
                disputés.
              </p>
              <p>
                Le code est ouvert. Le solveur minimax, le pipeline d'entraînement{" "}
                <Term term="AlphaZero">AlphaZero</Term>, les quinze variantes de règles
                et leurs logs partie par partie, l'export ONNX annexe, la glu
                WebAssembly — tout vit dans un unique workspace Rust que vous pouvez
                cloner et exécuter. Si vous ne retenez qu'une chose de ce récit,
                retenez la commande clone : la meilleure façon de faire confiance à
                un calcul, c'est de le refaire vous-même.
              </p>
            </>}
          />
          <p className="mono text-[13px] text-paper-3 pt-4 border-t border-hair">
            {STRINGS.hero.signOff[lang]}
          </p>
        </div>
      </div>
    </section>
  );
}
