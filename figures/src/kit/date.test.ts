import { describe, expect, it } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
  it('writes the day, the month in words and the year, per language', () => {
    expect(formatDate('fr', '2026-11-11')).toBe('11 novembre 2026');
    expect(formatDate('en', '2026-11-11')).toBe('11 November 2026');
    expect(formatDate('fr', '2026-01-01')).toBe('1 janvier 2026');
  });

  it('refuses what is not a calendar day', () => {
    expect(() => formatDate('en', '2026-02-30')).toThrow('not a date');
    expect(() => formatDate('en', '11/11/2026')).toThrow('not a date');
  });
});
