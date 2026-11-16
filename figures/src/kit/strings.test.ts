import { STRINGS, fidelityLabel, t, type StringKey } from './strings';

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

  it('fidelity label text in both languages for the three kinds', () => {
    expect(fidelityLabel('fr', 'live')).toBe('Calcul en direct');
    expect(fidelityLabel('en', 'live')).toBe('Computed live');
    expect(fidelityLabel('fr', 'illustrative')).toBe('Illustratif');
    expect(fidelityLabel('en', 'illustrative')).toBe('Illustrative');
    expect(fidelityLabel('fr', 'measured', 'data/table.json')).toBe(
      'Données mesurées · source : data/table.json',
    );
    expect(fidelityLabel('en', 'measured', 'data/table.json')).toBe('Measured data · source: data/table.json');
    expect(fidelityLabel('en', 'measured')).toBe('Measured data');
    expect(fidelityLabel('fr', 'live', undefined, 'gameLc12')).toBe('Calcul en direct · règle des répétitions (lc1-2)');
    expect(fidelityLabel('en', 'measured', 'data/v5.json', 'gameLc12')).toBe(
      'Measured data · repetition rule (lc1-2) · source: data/v5.json',
    );
  });
});
