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

/** The line that ends every figure; a `measured` one names its source file. */
export function fidelityLabel(lang: Lang, kind: Fidelity, source?: string): string {
  const label = t(lang, FIDELITY_KEY[kind]);
  return kind === 'measured' && source ? `${label} · ${t(lang, 'source')}${colon(lang)} ${source}` : label;
}
