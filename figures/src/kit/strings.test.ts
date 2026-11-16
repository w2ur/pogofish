import { STRINGS, precisionLines, t, type StringKey } from './strings';

/** « tu » and its forms as whole words. Letter-aware: `\b` alone takes « ê » for a word break and fires on « arrête ». */
const TU = /(?<!\p{L})(tu|te|ton|ta|tes|toi)(?!\p{L})/iu;

describe('strings', () => {
  it('every StringKey exists in fr and en, non-empty', () => {
    const fr = Object.keys(STRINGS.fr).sort();
    const en = Object.keys(STRINGS.en).sort();
    expect(fr).toEqual(en);
    expect(fr.length).toBeGreaterThan(0);
    for (const k of fr as StringKey[]) {
      expect(t('fr', k).trim()).not.toBe('');
      expect(t('en', k).trim()).not.toBe('');
    }
  });

  it('French copy uses typographic apostrophes, narrow no-break spaces and never « tu »', () => {
    for (const value of Object.values(STRINGS.fr)) {
      expect(value).not.toContain("'");
      // A colon, question mark, exclamation mark or semicolon is preceded by U+202F.
      expect(value).not.toMatch(/(^|[^ ])[:?!;]/);
      expect(value).not.toMatch(TU);
    }
  });

  it('the « tu » check sees the pronoun and not the end of a word', () => {
    for (const ok of ['rien n’arrête la partie', 'la tête', 'une partie', 'Bastille']) expect(ok).not.toMatch(TU);
    for (const bad of ['tu joues', 'à toi de jouer', 'Te voilà', 'ta pile']) expect(bad).toMatch(TU);
  });

  it('the kit’s « Précisions » sentences: how the figure is made, its date when measured, its game', () => {
    expect(precisionLines('fr', 'live')).toEqual(['Calculé dans votre navigateur par le moteur du jeu\u202f: rien n’est préenregistré.']);
    expect(precisionLines('en', 'live')).toEqual(['Computed in your browser by the game’s engine: nothing is prerecorded.']);
    expect(precisionLines('en', 'illustrative')).toEqual(['A drawing, not a computation.']);
    expect(precisionLines('en', 'measured')).toEqual(['Measured before publication: these numbers do not change when you play.']);
    expect(precisionLines('fr', 'measured', 'gameLc12', '11 novembre 2026')).toEqual([
      'Mesuré avant la publication\u202f: ces chiffres ne changent pas quand vous jouez. Données arrêtées le 11 novembre 2026.',
      'Ici, le joueur qui répète une troisième fois une position perd la partie.',
    ]);
    expect(precisionLines('en', 'live', 'gameA')).toEqual([
      'Computed in your browser by the game’s engine: nothing is prerecorded.',
      'Here the game has no stopping rule: a game may never end.',
    ]);
    // A date says when data was measured: a live figure has none to print.
    expect(precisionLines('en', 'live', undefined, '11 November 2026')).toHaveLength(1);
  });

  it('no figure string names a file, a path or a code name', () => {
    const code = /\.(json|bin|pfw|pfv|onnx)\b|[\w.-]\/[\w.]|\blc1-2\b|az-lc1|v4-td|\bseed\b/i;
    for (const lang of ['fr', 'en'] as const) {
      for (const value of Object.values(STRINGS[lang])) expect(value).not.toMatch(code);
    }
    // The control: the pattern sees what it is there to refuse.
    for (const bad of ['source : data/v5.json', 'Réseau az-lc1-s1', 'règle des répétitions (lc1-2)', 'seed 1']) expect(bad).toMatch(code);
  });
});
