// <pogo-count>: the number of Pogo positions, computed here in three steps
// (count-steps.ts) and shown one factor at a time, with the running product.
// The rows still to come keep their room, so a step never moves the page.
import { Stepper } from '../kit/stepper';
import { transport } from '../kit/controls';
import { autoplay } from '../kit/autoplay';
import { PogoFigure } from '../kit/figure';
import { t, type StringKey } from '../kit/strings';
import { countSteps, formatCount, type CountPart } from './count-steps';
import countCss from './pogo-count.css?raw';

const LABEL: Record<CountPart, StringKey> = { colours: 'countColours', stacks: 'countStacks', turn: 'countTurn' };

export class PogoCount extends PogoFigure {
  static override styles = countCss;
  static override stageMinHeight = '360px';

  protected render(signal: AbortSignal): void {
    const lang = this.lang;
    const steps = countSteps();
    // The narrow no-break space all but vanishes in the shout cut: each separator gets its own room.
    const number = (className: string, prefix: string, n: number): HTMLElement => {
      const span = el('span', className, prefix);
      fill(span, prefix, n);
      return span;
    };
    const fill = (span: HTMLElement, prefix: string, n: number): void => {
      span.replaceChildren(prefix);
      for (const part of formatCount(lang, n).split(/([^0-9])/)) {
        if (/^[0-9]*$/.test(part)) span.append(part);
        else span.append(el('span', 'sep', part));
      }
    };
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const root = el('div', 'count');
    const list = el('ol', 'factors');
    list.setAttribute('aria-label', t(lang, 'countSteps'));
    const rows = steps.map((s, i) => {
      const li = el('li', 'factor');
      const n = number('shout num value', i === 0 ? '' : '× ', s.factor);
      const what = el('span', 'what', t(lang, LABEL[s.part]));
      if (s.binomial) what.append(' ', el('span', 'binomial', `C(${s.binomial[0]}, ${s.binomial[1]})`));
      li.append(n, what);
      list.append(li);
      return li;
    });

    const total = el('p', 'total');
    total.setAttribute('aria-live', 'polite');
    const product = el('span', 'shout num product');
    const totalLabel = el('span', 'what', t(lang, 'countTotal'));
    total.append(product, totalLabel);
    root.append(list, total);

    const show = (i: number): void => {
      rows.forEach((r, k) => r.toggleAttribute('data-off', k > i));
      fill(product, '= ', steps[i]!.product);
      totalLabel.toggleAttribute('data-off', i < steps.length - 1);
    };
    const stepper = new Stepper(steps.length, show, { signal, interval: 1400 });
    show(0);
    root.append(transport(stepper, { lang }));
    autoplay(this, stepper, { signal, still: () => stepper.go(stepper.steps - 1) });
    this.stage.append(root);
  }
}
