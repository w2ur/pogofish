import type { Lang } from "./LangContext";

export type Bilingual = Record<Lang, string>;

export function t(strings: Bilingual, lang: Lang): string {
  return strings[lang];
}

/** All short bilingual strings: chrome, kickers, labels, captions. Long-form
 *  prose is rendered inline via <EnFr> to preserve inline markup (Term, em). */
export const STRINGS = {
  chrome: {
    tagline: { en: "a rewrite", fr: "journal d'une réécriture" },
    skipToPlay: { en: "skip to play →", fr: "aller au jeu →" },
    scroll: { en: "scroll", fr: "défiler" },
    footerTag: {
      en: "a board game · a misplaced trust · a rewrite",
      fr: "un jeu de plateau · un calcul mal délégué · une réécriture",
    },
    madeWithCare: { en: "Made with care by", fr: "Fait avec soin par" },
  },
  hero: {
    titleA: { en: "Does the first\u00A0player ", fr: "Le premier\u00A0joueur peut-il " },
    titleB: { en: "win", fr: "gagner" },
    titleC: { en: " at Pogo?", fr: " à Pogo ?" },
    signOff: { en: "— Claude & William, spring 2026", fr: "— Claude & William, printemps 2026" },
  },
  chapters: {
    I:   { en: "Before a single line of code",        fr: "Avant la première ligne de code" },
    II:  { en: "Five moves to feel the rules",        fr: "Cinq coups pour prendre le jeu en main" },
    III: { en: "Nine cells, a game I did not invent", fr: "Neuf cases, un jeu que je n'ai pas inventé" },
    IV:  { en: "\u201CNo more than a million.\u201D", fr: "«\u00A0Pas plus d'un million.\u00A0»" },
    V:   { en: "Thirty-six gigabytes at dawn",        fr: "Trente-six gigaoctets, un ventilateur qui se tait" },
    VI:  { en: "The tree had no leaves",              fr: "L'arbre n'avait pas de feuilles" },
    VII: { en: "The rules became the variable",       fr: "La règle devient la variable" },
    VIII:{ en: "Five candidate endings",              fr: "Cinq manières de finir" },
    IX:  { en: "One survives all three axes",         fr: "Une seule tient les trois critères" },
    X:   { en: "Now it is your move",                 fr: "À vous de jouer" },
    XI:  { en: "What it learned about winning",       fr: "Ce que la machine a appris" },
    XII: { en: "Keep the problem in your head",       fr: "Garder le problème en tête" },
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
    h2A: { en: "If the rules were the variable, which rule was the ", fr: "Si la règle était la variable, laquelle était la " },
    h2B: { en: "good",                                                fr: "bonne" },
    h2C: { en: " one?",                                               fr: "\u00A0?" },
  },
  scene8: {
    h2A: { en: "Two survive all three ",       fr: "Deux tiennent les trois " },
    h2B: { en: "axes",                         fr: "critères" },
    h2C: { en: ". Three do not.",              fr: ". Les trois autres, non." },
    intro: {
      en: "Balance, skill, and earned draws — pass or fail, per variant, per metric. The bars below are the tournament results compressed into three numbers. The full per-game logs are checked into the repository, but the story they tell is visible from across the room.",
      fr: "Équilibre, hiérarchie des forces, nuls mérités : chaque variante passe ou ne passe pas, critère par critère. Les barres qui suivent résument un tournoi de plusieurs milliers de parties en trois chiffres ; les relevés partie par partie dorment dans le dépôt, mais l'histoire qu'ils racontent se voit de loin.",
    },
    tableHeaders: {
      variant: { en: "variant", fr: "variante" },
      balance: { en: "balance", fr: "équilibre" },
      skill:   { en: "skill",   fr: "hiérarchie" },
      draws:   { en: "draws",   fr: "nuls" },
      verdict: { en: "verdict", fr: "verdict" },
    },
    badges: {
      pass: { en: "pass", fr: "tient" },
      warn: { en: "warn", fr: "réserve" },
      fail: { en: "fail", fr: "cède" },
    },
  },
  scene11: {
    kicker: { en: "Glossary", fr: "Glossaire" },
    h2A: { en: "Every term the story used, in ",      fr: "Chaque terme du récit, en " },
    h2B: { en: "plain",                                fr: "français" },
    h2C: { en: " English.",                            fr: " clair." },
    intro: {
      en: "I did not know most of these when I started. The definitions below are the versions I wish someone had handed me at the time — short, specific, and free of the assumption that you already know the surrounding ten terms.",
      fr: "La plupart de ces mots ne me disaient rien lorsque j'ai commencé. Les définitions qui suivent sont celles que j'aurais voulu qu'on me tende à l'époque : brèves, précises, et qui ne tiennent jamais pour acquise la connaissance des dix termes voisins.",
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
    h2:           { en: "Try a few moves before we go on.", fr: "Cinq coups pour prendre le jeu en main, avant de reprendre la lecture." },
    body:         { en: "You play White. Red answers with a fixed rule: capture if it can, otherwise stack, otherwise pick the first legal move. After five of your plies, the article scrolls on.",
                    fr: "Vous jouez les Blancs. Rouge répond par une règle fixe : il capture s'il peut, sinon il empile, et à défaut il joue le premier coup légal. Cinq de vos demi-coups suffisent ; après quoi l'article reprend son cours." },
    bodyWhite:    { en: "White",         fr: "les Blancs" },
    ply:          { en: "ply {n} / {m}", fr: "demi-coup {n} / {m}" },
    drillDone:    { en: "Drill complete.", fr: "Exercice terminé." },
    yourMove:     { en: "Your move.",     fr: "À vous." },
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
      "LC2-30": { en: "Parity of cap decides winner — skill barely matters.", fr: "La parité du plafond tranche à la place des joueurs." },
      "LC3-40": { en: "Draw rate creeps. Readable but flat.",                  fr: "Les nuls s'installent. Jouable, mais sans relief." },
      "LC1-3":  { en: "Balanced, but defensive play dominates.",               fr: "Équilibré sur le papier, défensif en pratique." },
    },
    suddenDeath: {
      paraEn: "Sudden Death wins on elegance. Repeat a position, you lose. Every move is consequential because the cost of stalling is built into the rule itself, not bolted on with a move counter. The network learned this quickly: strong AlphaZero beat strong DQN 82 % of the time, and zero games ended in a draw. A game that either decides or continues.",
      paraFr: "Mort subite gagne par élégance. Répéter une position vous fait perdre, et le coût de l'attentisme est inscrit dans la règle elle-même plutôt que greffé par un compteur : chaque pose engage quelque chose. Le réseau l'a compris vite. Un AlphaZero entraîné bat un DQN entraîné 82 fois sur cent, et pas une partie n'a fini sur un nul. Un jeu qui tranche, ou qui continue.",
      tag:    { en: "LC1-2 · 52 % W · 82 % skill · 0 % draws", fr: "LC1-2 · 52 % B · 82 % niveau · 0 % nuls" },
    },
    classic: {
      paraEn: "Classic · 29 wins on feel. A move budget you can hear ticking, a clean tiebreaker (most towers), and draws that exist but are earned — strong players drew each other 5.5 % of the time, no mismatched pair ever did. It is the rule I would pick if I were teaching a ten-year-old the game, which is the highest compliment a rule change can earn.",
      paraFr: "Classique · 29 gagne à l'oreille. Un budget de coups qu'on entend décompter, un départage propre (le plus de tours), et des nuls qui existent mais qui se paient : les joueurs forts en ont fait 5,5 % entre eux, jamais une paire déséquilibrée n'en a arraché un. C'est la règle que je choisirais pour apprendre le jeu à un enfant de dix ans — et, pour une règle, c'est difficile de recevoir un plus beau compliment.",
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
  pullQuote: { en: "Somebody, eventually, has to lose.", fr: "Il faut bien, à la fin, que quelqu'un perde." },
  callouts: {
    thesis: {
      en: "A thesis-sized question on a kitchen-table board.",
      fr: "Une question de thèse posée sur un plateau qui tient dans la main.",
    },
    parityTrick: {
      en: "A rule that makes reinforcement learning converge on a trick is a rule that is not about the board.",
      fr: "Une règle qui fait converger l'apprentissage par renforcement vers une astuce n'est plus une règle qui parle du plateau. C'est une règle qui parle d'un compteur.",
    },
    outsource: {
      en: "You cannot outsource the part of the thinking that tells you whether the thinking is working.",
      fr: "Il y a une part du raisonnement qu'on ne peut pas déléguer : celle qui vous dit si le raisonnement fonctionne.",
    },
  },
  play: {
    h2A:           { en: "Against an opponent that learned this ",             fr: "Face à un adversaire qui a appris le jeu " },
    h2B:           { en: "rewritten",                                           fr: "réécrit" },
    h2C:           { en: " game from a million games of itself.",               fr: " sur un million de parties contre lui-même." },
    intro:         { en: "Pick a rule. Pick a side. The network running in your browser is the same one that won the tournament — exported as ",
                     fr: "Choisissez une règle, choisissez un camp. Le réseau qui tourne dans votre navigateur est exactement celui qui a remporté le tournoi — exporté en " },
    introTail:     { en: " (a portable file format for trained networks) and loaded client-side, with no server in the loop. Every move it plays here is computed in your browser, on your device.",
                     fr: " (un format de fichier portable pour les réseaux entraînés), puis chargé côté navigateur, sans serveur dans la boucle. Chaque coup qu'il joue ici est calculé dans votre navigateur, sur votre appareil." },
    settingsRule:       { en: "Rule",            fr: "Règle" },
    settingsRuleHint:   { en: "The losing condition the game is played under.", fr: "La condition de défaite sous laquelle la partie se joue." },
    settingsOpponent:   { en: "Opponent",        fr: "Adversaire" },
    settingsOppHint:    { en: "Which network evaluates positions.",             fr: "Quel réseau évalue les positions." },
    settingsMcts:       { en: "MCTS simulations", fr: "Simulations MCTS" },
    settingsMctsHint:   { en: "Rollouts per move. More = slower, stronger.",   fr: "Déroulements par coup. Plus il y en a, plus c'est lent — et plus c'est fort." },
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
    h2A:         { en: "After ",                          fr: "Au bout de " },
    h2B:         { en: " games against itself, the network had opinions.",
                   fr: " parties jouées contre lui-même, le réseau avait des idées bien arrêtées." },
    intro:       { en: "I didn't train it. I don't play Pogo. But I can tell you what it learned, from the same run that won the tournament — LC3-29, at 200 ",
                   fr: "Je ne l'ai pas entraîné. Je ne joue pas à Pogo. Mais je peux vous dire ce qu'il a appris, à partir du même run qui a remporté le tournoi — LC3-29, à 200 " },
    introMid:    { en: " simulations per move. Stats are empirical; diagrams are real positions from the sweep.",
                   fr: " simulations par coup. Les statistiques sont empiriques ; les diagrammes, eux, sont des positions réellement jouées lors de l'enquête." },
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
    en: "Pogofish — an AI tells the story of one overconfident sentence",
    fr: "Pogofish — le récit, par une IA, d'une phrase trop confiante",
  },
} as const;

/** Simple {n}-style interpolation for strings with one placeholder. */
export function tf(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
}
