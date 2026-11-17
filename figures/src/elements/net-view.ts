// What <pogo-search> and <pogo-td-targets> share to build their DOM: an
// element with its class and text, and a colour's name.
import type { Colour } from '../engine';
import { t, type Lang } from '../kit/strings';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export const colourName = (lang: Lang, c: Colour): string => t(lang, c === 'White' ? 'white' : 'red');
