import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { controlButton } from './controls';
import { keepCase } from './keep-case';

const text = (nodes: (string | Node)[]): string => nodes.map((n) => (typeof n === 'string' ? n : n.textContent)).join('');

describe('keepCase', () => {
  it('wraps λ so the uppercase cut leaves it alone, the text unchanged', () => {
    const nodes = keepCase('TD(λ)');
    expect(text(nodes)).toBe('TD(λ)');
    const spans = nodes.filter((n): n is HTMLElement => typeof n !== 'string');
    expect(spans.map((s) => [s.className, s.textContent])).toEqual([['keep-case', 'λ']]);
  });

  it('leaves text with nothing to keep as one string', () => {
    expect(keepCase('Q-learning')).toEqual(['Q-learning']);
    expect(keepCase('')).toEqual([]);
  });

  it('the kit sheet sets the span’s transform to none', () => {
    expect(readFileSync('src/kit/theme.css', 'utf8')).toMatch(/\.keep-case \{\s*text-transform: none;/);
  });

  it('a control’s label keeps its λ: the picker reads « TD(λ) »', () => {
    const b = controlButton('TD(λ)', () => {});
    expect(b.textContent).toBe('TD(λ)');
    expect(b.querySelector('.keep-case')!.textContent).toBe('λ');
  });
});
