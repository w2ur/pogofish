import { describe, expect, it } from 'vitest';
import { formatInterval, formatScore, formatShare, percent } from './score';

describe('formatScore', () => {
  it('prints a score as a percentage with one decimal, its interval in the same unit', () => {
    expect(formatScore('fr', { score: 0.8905, ci95: [0.8776769626887432, 0.9033230373112567] })).toBe('89,1 % [87,8 ; 90,3]');
    expect(formatScore('en', { score: 0.8905, ci95: [0.8776769626887432, 0.9033230373112567] })).toBe('89.1% [87.8; 90.3]');
    expect(formatScore('fr', { score: 0.855, ci95: [0.823, 0.887] })).toBe('85,5 % [82,3 ; 88,7]');
  });

  it('rounds a trailing 5 up, not down', () => {
    expect(percent(0.8905)).toBe(89.1);
    expect(percent(0.0315)).toBe(3.2);
    expect(percent(0.7835)).toBe(78.4);
  });

  it('keeps one decimal on a round value', () => {
    expect(formatScore('en', { score: 0.5, ci95: [0.48, 0.52] })).toBe('50.0% [48.0; 52.0]');
  });
});

describe('formatShare', () => {
  it('prints a share as the score is printed, without an interval', () => {
    expect(formatShare('fr', 97 / 186)).toBe('52,2 %');
    expect(formatShare('en', 7 / 465)).toBe('1.5%');
    expect(formatShare('fr', 0.0315)).toBe('3,2 %');
  });
});

describe('formatInterval', () => {
  it('says an interval in words, the unit once, after the upper bound', () => {
    expect(formatInterval('fr', [0.823, 0.887])).toBe('82,3 à 88,7 %');
    expect(formatInterval('en', [0.823, 0.887])).toBe('82.3 to 88.7%');
  });
});
