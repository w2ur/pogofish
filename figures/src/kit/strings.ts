// Every string a figure shows, in both languages. French copy addresses the
// reader as « vous », uses U+2019 apostrophes and a narrow no-break space
// (U+202F) before « : ? ! ; ». Later figures add their own keys here.

export type Lang = 'fr' | 'en';
export type Fidelity = 'live' | 'measured' | 'illustrative';

const fr = {
  play: 'Lecture',
  pause: 'Pause',
  previous: 'Étape précédente',
  next: 'Étape suivante',
  restart: 'Recommencer',
  newGame: 'Nouvelle partie',
  playFromHere: 'Jouer d’ici',
  fidelityLive: 'Calcul en direct',
  fidelityMeasured: 'Données mesurées',
  fidelityIllustrative: 'Illustratif',
  source: 'source',
  gameA: 'jeu sans règle d’arrêt',
  gameLc12: 'règle des répétitions (lc1-2)',
  white: 'Blanc',
  red: 'Rouge',
  wins: 'gagne',
  loses: 'perd',
  holdsDraw: 'garde la nulle',
  loading: 'Chargement…',
  failed: 'Cette figure n’a pas pu être calculée.',
  board: 'Plateau',
  side: 'Votre camp',
  level: 'Niveau',
  easy: 'Facile',
  normal: 'Normal',
  hard: 'Difficile',
  measured: 'mesuré',
  chooseSide: 'Choisissez votre camp et le niveau, puis lancez une nouvelle partie.',
  yourTurn: 'À vous de jouer',
  thinking: 'L’IA réfléchit…',
  searchFailed: 'L’IA n’a pas pu jouer.',
  retry: 'Réessayer',
  resumed: 'Position reprise',
  pieces: 'Pièces à soulever',
  movesPlayed: 'Coups joués',
  plays: 'joue',
  youWin: 'Vous gagnez.',
  aiWins: 'L’IA gagne.',
  byStacksWhite: 'Toutes les piles ont un sommet blanc.',
  byStacksRed: 'Toutes les piles ont un sommet rouge.',
  byRepetition: 'a produit une position pour la troisième fois et perd, selon la règle des répétitions.',
  empty: 'vide',
  stackOf: 'pile de',
  topWhite: 'sommet blanc',
  topRed: 'sommet rouge',
  canLift: 'à vous',
  selected: 'soulevée',
  target: 'destination possible',
  expand: 'Ouvrir',
  collapse: 'Réduire',
  net: 'Réseau',
  netScore: 'Au niveau normal, 100 simulations, il marque',
  netAgainst: 'contre le joueur glouton.',
};

export type StringKey = keyof typeof fr;

// Typed against the French keys: a key missing here, or one French lacks, fails tsc.
const en: Record<StringKey, string> = {
  play: 'Play',
  pause: 'Pause',
  previous: 'Previous step',
  next: 'Next step',
  restart: 'Restart',
  newGame: 'New game',
  playFromHere: 'Play from here',
  fidelityLive: 'Computed live',
  fidelityMeasured: 'Measured data',
  fidelityIllustrative: 'Illustrative',
  source: 'source',
  gameA: 'game with no stopping rule',
  gameLc12: 'repetition rule (lc1-2)',
  white: 'White',
  red: 'Red',
  wins: 'wins',
  loses: 'loses',
  holdsDraw: 'holds the draw',
  loading: 'Loading…',
  failed: 'This figure could not be computed.',
  board: 'Board',
  side: 'Your side',
  level: 'Level',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  measured: 'measured',
  chooseSide: 'Choose your side and the level, then start a new game.',
  yourTurn: 'Your move',
  thinking: 'The AI is thinking…',
  searchFailed: 'The AI could not move.',
  retry: 'Retry',
  resumed: 'Position taken up',
  pieces: 'Pieces to lift',
  movesPlayed: 'Moves played',
  plays: 'plays',
  youWin: 'You win.',
  aiWins: 'The AI wins.',
  byStacksWhite: 'Every stack has White on top.',
  byStacksRed: 'Every stack has Red on top.',
  byRepetition: 'produced a position for the third time and loses, under the repetition rule.',
  empty: 'empty',
  stackOf: 'stack of',
  topWhite: 'White on top',
  topRed: 'Red on top',
  canLift: 'yours to move',
  selected: 'lifted',
  target: 'possible destination',
  expand: 'Open',
  collapse: 'Collapse',
  net: 'Net',
  netScore: 'At normal level, 100 simulations, it scores',
  netAgainst: 'against the greedy player.',
};

export const STRINGS: Record<Lang, Record<StringKey, string>> = { fr, en };

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[lang][key];
}

/** A colon in the language's typography: « source : » in French, "source:" in English. */
export function colon(lang: Lang): string {
  return lang === 'fr' ? ' :' : ':';
}

const FIDELITY_KEY: Record<Fidelity, StringKey> = {
  live: 'fidelityLive',
  measured: 'fidelityMeasured',
  illustrative: 'fidelityIllustrative',
};

/** The line that ends every figure: the kind, the game it is computed in if named, then a `measured` one's source file. */
export function fidelityLabel(lang: Lang, kind: Fidelity, source?: string, game?: 'gameA' | 'gameLc12'): string {
  const label = game ? `${t(lang, FIDELITY_KEY[kind])} · ${t(lang, game)}` : t(lang, FIDELITY_KEY[kind]);
  return kind === 'measured' && source ? `${label} · ${t(lang, 'source')}${colon(lang)} ${source}` : label;
}
