import type { Lang } from "./LangContext";

export type Bilingual = Record<Lang, string>;

export function t(strings: Bilingual, lang: Lang): string {
  return strings[lang];
}

/** All short bilingual strings: chrome, kickers, labels, captions. Long-form
 *  prose is rendered inline via <EnFr> to preserve inline markup (Term, em). */
export const STRINGS = {
  chrome: {
    tagline: { en: "a rewrite", fr: "une réécriture" },
    skipToPlay: { en: "skip to play →", fr: "aller au jeu →" },
    scroll: { en: "scroll", fr: "défiler" },
    footerTag: {
      en: "a board game · a misplaced trust · a rewrite",
      fr: "un jeu de plateau · une confiance mal placée · une réécriture",
    },
    madeWithCare: { en: "Made with care by", fr: "Fait avec soin par" },
  },
  hero: {
    titleA: { en: "Does the first\u00A0player ", fr: "Le premier\u00A0joueur peut-il " },
    titleB: { en: "win", fr: "gagner" },
    titleC: { en: " at Pogo?", fr: " à Pogo ?" },
    signOff: { en: "— William, spring 2026", fr: "— William, printemps 2026" },
  },
  chapters: {
    I:   { en: "Before a single line of code",        fr: "Avant la première ligne de code" },
    II:  { en: "Five moves to feel the rules",        fr: "Cinq coups pour sentir les règles" },
    III: { en: "Nine cells, a game I did not invent", fr: "Neuf cases, un jeu que je n'ai pas inventé" },
    IV:  { en: "\u201CNo more than a million.\u201D", fr: "«\u00A0Pas plus d'un million.\u00A0»" },
    V:   { en: "Thirty-six gigabytes at dawn",        fr: "Trente-six gigaoctets à l'aube" },
    VI:  { en: "The tree had no leaves",              fr: "L'arbre n'avait pas de feuilles" },
    VII: { en: "The rules became the variable",       fr: "Les règles sont devenues la variable" },
    VIII:{ en: "Five candidate endings",              fr: "Cinq fins candidates" },
    IX:  { en: "One survives all three axes",         fr: "Une seule survit aux trois axes" },
    X:   { en: "Now it is your move",                 fr: "À vous de jouer" },
    XI:  { en: "What it learned about winning",       fr: "Ce qu'elle a appris pour gagner" },
    XII: { en: "Keep the problem in your head",       fr: "Gardez le problème en tête" },
  },
  pinned: {
    positionOf: { en: "Position {n} of 5", fr: "Position {n} sur 5" },
    labels: {
      opening:     { en: "opening",     fr: "ouverture" },
      theClaim:    { en: "the claim",   fr: "l'affirmation" },
      sixDays:     { en: "six days",    fr: "six jours" },
      theRules:    { en: "the rules",   fr: "les règles" },
      equilibrium: { en: "equilibrium", fr: "équilibre" },
    },
  },
  scene7: {
    h2A: { en: "If the rules were the variable, which rule was the ", fr: "Si les règles étaient la variable, quelle était la " },
    h2B: { en: "good",                                                fr: "bonne" },
    h2C: { en: " one?",                                               fr: "\u00A0?" },
  },
  scene8: {
    h2A: { en: "Two survive all three ",       fr: "Deux survivent aux trois " },
    h2B: { en: "axes",                         fr: "axes" },
    h2C: { en: ". Three do not.",              fr: ". Trois non." },
    intro: {
      en: "Balance, skill, and earned draws — pass or fail, per variant, per metric. The bars below are the tournament results compressed into three numbers. The full per-game logs are checked into the repository, but the story they tell is visible from across the room.",
      fr: "Équilibre, niveau et nuls mérités — réussi ou raté, par variante, par mesure. Les barres ci-dessous sont les résultats du tournoi compressés en trois chiffres. Les logs partie par partie sont dans le dépôt, mais l'histoire qu'ils racontent se voit à l'autre bout de la pièce.",
    },
    tableHeaders: {
      variant: { en: "variant", fr: "variante" },
      balance: { en: "balance", fr: "équilibre" },
      skill:   { en: "skill",   fr: "niveau" },
      draws:   { en: "draws",   fr: "nuls" },
      verdict: { en: "verdict", fr: "verdict" },
    },
    badges: {
      pass: { en: "pass", fr: "réussi" },
      warn: { en: "warn", fr: "avert" },
      fail: { en: "fail", fr: "raté" },
    },
  },
  scene11: {
    kicker: { en: "Glossary", fr: "Glossaire" },
    h2A: { en: "Every term the story used, in ",      fr: "Chaque terme du récit, en " },
    h2B: { en: "plain",                                fr: "français" },
    h2C: { en: " English.",                            fr: " clair." },
    intro: {
      en: "I did not know most of these when I started. The definitions below are the versions I wish someone had handed me at the time — short, specific, and free of the assumption that you already know the surrounding ten terms.",
      fr: "Je ne connaissais pas la plupart de ces termes en commençant. Les définitions ci-dessous sont celles que j'aurais aimé qu'on me tende à l'époque — courtes, précises, sans supposer qu'on connaisse déjà les dix termes voisins.",
    },
    groups: {
      AI:    { name: { en: "AI & learning",   fr: "IA & apprentissage" },  blurb: { en: "Tools that learn from playing themselves.",                    fr: "Des outils qui apprennent en jouant contre eux-mêmes." } },
      Infra: { name: { en: "Infrastructure", fr: "Infrastructure" },       blurb: { en: "How the code runs on your laptop and in your browser.",        fr: "Comment le code tourne sur votre machine et dans votre navigateur." } },
      Pogo:  { name: { en: "Pogo",            fr: "Pogo" },                blurb: { en: "Terms specific to this board.",                                 fr: "Des termes propres à ce plateau." } },
    },
  },
  scene12: {
    h2A: { en: "Keep enough of the problem in your own head to know when something is ", fr: "Gardez assez du problème en tête pour savoir quand quelque chose " },
    h2B: { en: "wrong",                                                                   fr: "cloche" },
    h2C: { en: ".",                                                                       fr: "." },
  },
  tryYourself: {
    h2:           { en: "Try a few moves before we go on.", fr: "Essayez quelques coups avant de continuer." },
    body:         { en: "You play White. Red answers with a fixed rule: capture if it can, otherwise stack, otherwise pick the first legal move. After five of your plies, the article scrolls on.",
                    fr: "Vous jouez les Blancs. Rouge répond avec une règle fixe : capture si possible, sinon empile, sinon prend le premier coup légal. Après cinq de vos demi-coups, l'article reprend." },
    bodyWhite:    { en: "White",         fr: "les Blancs" },
    ply:          { en: "ply {n} / {m}", fr: "demi-coup {n} / {m}" },
    drillDone:    { en: "Drill complete.", fr: "Exercice terminé." },
    yourMove:     { en: "Your move.",     fr: "À vous de jouer." },
    redThinking:  { en: "Red is thinking…", fr: "Rouge réfléchit…" },
    continue:     { en: "↓ continue reading", fr: "↓ continuer la lecture" },
  },
  variants: {
    "LC1-2":  { label: { en: "Sudden Death",     fr: "Mort subite" },         rule: { en: "Repeat a position twice \u2192 you lose.",     fr: "Répéter une position deux fois \u2192 vous perdez." } },
    "LC1-3":  { label: { en: "Triple Repeat",    fr: "Triple répétition" },   rule: { en: "Three-fold repetition ends the game.",          fr: "La répétition triple met fin à la partie." } },
    "LC2-30": { label: { en: "Hard Cap",         fr: "Plafond strict" },      rule: { en: "30 moves. Parity picks the winner.",            fr: "30 coups. La parité choisit le vainqueur." } },
    "LC3-29": { label: { en: "Classic",          fr: "Classique" },           rule: { en: "29 moves. Most towers wins. Ties draw.",        fr: "29 coups. Le plus de tours l'emporte. Égalité = nul." } },
    "LC3-40": { label: { en: "Long Soft Cap",    fr: "Plafond souple long" }, rule: { en: "40 moves. Draws get earned.",                   fr: "40 coups. Les nuls se méritent." } },
  },
  verdict: {
    labels: {
      "LC1-2":  { en: "Sudden Death",     fr: "Mort subite" },
      "LC2-30": { en: "Hard Cap · 30",    fr: "Plafond strict · 30" },
      "LC3-29": { en: "Classic · 29",     fr: "Classique · 29" },
      "LC3-40": { en: "Long Soft Cap",    fr: "Plafond souple long" },
      "LC1-3":  { en: "Triple Repeat",    fr: "Triple répétition" },
    },
    failReasons: {
      "LC2-30": { en: "Parity of cap decides winner — skill barely matters.", fr: "La parité du plafond décide du vainqueur — le niveau pèse à peine." },
      "LC3-40": { en: "Draw rate creeps. Readable but flat.",                  fr: "Le taux de nuls grimpe. Lisible mais plat." },
      "LC1-3":  { en: "Balanced, but defensive play dominates.",               fr: "Équilibré, mais le jeu défensif domine." },
    },
    suddenDeath: {
      paraEn: "Sudden Death wins on elegance. Repeat a position, you lose. Every move is consequential because the cost of stalling is built into the rule itself, not bolted on with a move counter. The network learned this quickly: strong AlphaZero beat strong DQN 82 % of the time, and zero games ended in a draw. A game that either decides or continues.",
      paraFr: "Mort subite gagne par élégance. Répétez une position, vous perdez. Chaque coup compte parce que le coût du blocage est dans la règle elle-même, pas greffé par un compteur. Le réseau l'a vite compris : un AlphaZero fort bat un DQN fort 82 % du temps, et zéro partie nulle. Un jeu qui tranche ou qui continue.",
      tag:    { en: "LC1-2 · 52 % W · 82 % skill · 0 % draws", fr: "LC1-2 · 52 % B · 82 % niveau · 0 % nuls" },
    },
    classic: {
      paraEn: "Classic · 29 wins on feel. A move budget you can hear ticking, a clean tiebreaker (most towers), and draws that exist but are earned — strong players drew each other 5.5 % of the time, no mismatched pair ever did. It is the rule I would pick if I were teaching a ten-year-old the game, which is the highest compliment a rule change can earn.",
      paraFr: "Classique · 29 gagne au feeling. Un budget de coups qu'on entend tourner, un départage net (le plus de tours), et des nuls qui existent mais se méritent — les joueurs forts ont fait match nul 5,5 % du temps, jamais les paires déséquilibrées. C'est la règle que je choisirais pour apprendre le jeu à un enfant de dix ans, ce qui est le plus beau compliment qu'une règle puisse recevoir.",
      tag:    { en: "LC3-29 · 50 % W · 77 % skill · 5.5 % draws", fr: "LC3-29 · 50 % B · 77 % niveau · 5,5 % nuls" },
    },
  },
  charts: {
    statesVisited:  { en: "states visited", fr: "états visités" },
    oomDay6:        { en: "OOM · day 6",    fr: "OOM · jour 6" },
    peakRam:        { en: "peak {n} states · 36\u00A0GB RAM", fr: "pic {n} états · 36\u00A0Go RAM" },
    whatIDrew:      { en: "what I drew",                        fr: "ce que j'avais dessiné" },
    finiteLeaves:   { en: "finite · ends at leaves",            fr: "fini · se termine aux feuilles" },
    whatIWasSolving:{ en: "what I was solving",                 fr: "ce que je résolvais" },
    artificialHorizon: { en: "artificial horizon",              fr: "horizon artificiel" },
    infiniteCycles: { en: "infinite · cycles below the line",   fr: "infini · cycles sous la ligne" },
  },
  compare: {
    claimed:       { en: "claimed",                        fr: "annoncé" },
    actualLower:   { en: "actually reachable, lower bound", fr: "réellement atteignable, borne inférieure" },
  },
  transcript: {
    header: { en: "claude · session 0 · 2026-03-19", fr: "claude · session 0 · 2026-03-19" },
    prompt: { en: "> how many reachable states?",     fr: "> combien d'états atteignables\u00A0?" },
    answerA:{ en: "no more than ",                    fr: "pas plus de " },
    answerB:{ en: "\u2248 1,000,000",                 fr: "\u22481\u00A0000\u00A0000" },
    answerC:{ en: ". easy solve — a few hours, single-threaded.", fr: ". solveur facile — quelques heures, mono-thread." },
  },
  pullQuote: { en: "Somebody, eventually, has to lose.", fr: "Quelqu'un, à un moment, doit perdre." },
  callouts: {
    thesis: {
      en: "A thesis-sized question on a kitchen-table board.",
      fr: "Une question de thèse sur un plateau de table de cuisine.",
    },
    parityTrick: {
      en: "A rule that makes reinforcement learning converge on a trick is a rule that is not about the board.",
      fr: "Une règle qui pousse l'apprentissage par renforcement à converger vers un truc n'est plus une règle qui parle du plateau.",
    },
    outsource: {
      en: "You cannot outsource the part of the thinking that tells you whether the thinking is working.",
      fr: "On ne peut pas déléguer la part du raisonnement qui vous dit si le raisonnement fonctionne.",
    },
  },
  play: {
    h2A:           { en: "Against an opponent that learned this ",             fr: "Contre un adversaire qui a appris ce jeu " },
    h2B:           { en: "rewritten",                                           fr: "réécrit" },
    h2C:           { en: " game from a million games of itself.",               fr: " sur un million de parties contre lui-même." },
    intro:         { en: "Pick a rule. Pick a side. The network running in your browser is the same one that won the tournament — exported through ",
                     fr: "Choisissez une règle. Choisissez un camp. Le réseau qui tourne dans votre navigateur est celui qui a remporté le tournoi — exporté via " },
    introTail:     { en: " and loaded client-side, no server in the loop.",    fr: " et chargé côté client, sans serveur dans la boucle." },
    settingsRule:       { en: "Rule",            fr: "Règle" },
    settingsRuleHint:   { en: "The losing condition the game is played under.", fr: "La condition de défaite sous laquelle la partie se joue." },
    settingsOpponent:   { en: "Opponent",        fr: "Adversaire" },
    settingsOppHint:    { en: "Which network evaluates positions.",             fr: "Quel réseau évalue les positions." },
    settingsMcts:       { en: "MCTS simulations", fr: "Simulations MCTS" },
    settingsMctsHint:   { en: "Rollouts per move. More = slower, stronger.",   fr: "Déroulements par coup. Plus = plus lent, plus fort." },
    settingsPlayAs:     { en: "Play as",         fr: "Jouer en" },
    settingsPlayAsHint: { en: "Your color on the board.",                       fr: "Votre couleur sur le plateau." },
    begin:              { en: "Begin the game →", fr: "Commencer la partie →" },
    playAgain:          { en: "Play again",       fr: "Rejouer" },
    changeSettings:     { en: "Change settings",  fr: "Changer les réglages" },
    continue:           { en: "↓ continue reading", fr: "↓ continuer la lecture" },
    whitePlays:         { en: "White (first)",    fr: "Blanc (premier)" },
    red:                { en: "Red",              fr: "Rouge" },
    variantSD:          { en: "Sudden Death",     fr: "Mort subite" },
    variantSDSub:       { en: "repeat → lose",    fr: "répéter → perdre" },
    variantClassic:     { en: "Classic",          fr: "Classique" },
    variantClassicSub:  { en: "29-move cap",      fr: "plafond 29 coups" },
    yourTurn:           { en: "Your turn",        fr: "À vous" },
    thinking:           { en: "Thinking…",        fr: "Réflexion…" },
    whitesTurn:         { en: "White's turn",     fr: "Au tour des Blancs" },
    redsTurn:           { en: "Red's turn",       fr: "Au tour des Rouges" },
    whiteWins:          { en: "White wins.",      fr: "Blanc gagne." },
    redWins:            { en: "Red wins.",        fr: "Rouge gagne." },
    draw:               { en: "Draw.",            fr: "Match nul." },
    repetitionBadge:    { en: "Position seen {n}× — one more repeat loses.",
                          fr: "Position vue {n}× — une répétition de plus fait perdre." },
    moveCounter:        { en: "Move {n} / {cap}", fr: "Coup {n} / {cap}" },
    oppHuman:           { en: "Human (hot-seat)", fr: "Humain (à tour de rôle)" },
    oppHumanHint:       { en: "no AI",            fr: "sans IA" },
    oppRandom:          { en: "Random",           fr: "Aléatoire" },
    oppRandomHint:      { en: "noise",            fr: "bruit" },
    oppDqn:             { en: "DQN",              fr: "DQN" },
    oppDqnHint:         { en: "first try",        fr: "premier essai" },
    oppAz:              { en: "AlphaZero",        fr: "AlphaZero" },
    oppAzHint:          { en: "current best",     fr: "meilleur actuel" },
    oppAzMcts:          { en: "AlphaZero + MCTS", fr: "AlphaZero + MCTS" },
    oppAzMctsHint:      { en: "strongest",        fr: "le plus fort" },
  },
  learnings: {
    loadError:   { en: "Could not load insights: ",       fr: "Impossible de charger les insights : " },
    loading:     { en: "Loading what the AI learned…",    fr: "Chargement de ce que l'IA a appris…" },
    h2A:         { en: "After ",                          fr: "Après " },
    h2B:         { en: " games against itself, the network had opinions.",
                   fr: " parties contre lui-même, le réseau avait des avis." },
    intro:       { en: "These come from the same model you just played against — LC3-29, at 200 ",
                   fr: "Elles viennent du même modèle contre lequel vous venez de jouer — LC3-29, à 200 " },
    introMid:    { en: " simulations per move. Stats are empirical; diagrams are real positions from the sweep.",
                   fr: " simulations par coup. Les stats sont empiriques ; les diagrammes sont de vraies positions du sweep." },
    initialPosition: { en: "initial position", fr: "position initiale" },
    capturesByPly:   { en: "captures by ply",  fr: "captures par demi-coup" },
    whiteWinsShort:  { en: "White wins",       fr: "Blanc gagne" },
    redWinsShort:    { en: "Red wins",         fr: "Rouge gagne" },
  },
  playCta: {
    label:    { en: "▶ Play",                     fr: "▶ Jouer" },
    ariaLabel:{ en: "Jump to the playable game", fr: "Aller au jeu jouable" },
  },
  pageTitle: {
    en: "Pogofish — the story of a rule that had to be fixed",
    fr: "Pogofish — l'histoire d'une règle qu'il a fallu réparer",
  },
} as const;

/** Simple {n}-style interpolation for strings with one placeholder. */
export function tf(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
}
