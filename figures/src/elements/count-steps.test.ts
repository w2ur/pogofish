import { describe, expect, it } from 'vitest';
import { countNodes, formatCount } from './count-steps';

describe('large numbers', () => {
  it('writes numbers in each language’s grouping', () => {
    expect(formatCount('fr', 232792560)).toBe('232\u202f792\u202f560');
    expect(formatCount('en', 232792560)).toBe('232,792,560');
    expect(formatCount('fr', 924)).toBe('924');
  });

  it('gives each group separator its own node, the digits as text', () => {
    const nodes = countNodes('en', 125970);
    expect(nodes.map((n) => (typeof n === 'string' ? n : n.textContent))).toEqual(['125', ',', '970']);
    expect(nodes.filter((n) => typeof n !== 'string').every((n) => (n as HTMLElement).className === 'sep')).toBe(true);
  });
});
