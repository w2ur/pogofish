// <pogo-net kind="td|az">: a net at work on one position (figs. 16 and 20).
// The position is the reader's board right now, else the default game's
// (net-position.ts), the same one <pogo-encoding> shows; the figure follows
// the store as the reader plays. The layers are read from the loaded file's
// header (net-layers.ts), drawn as what they are: a count of units, one bar per
// layer on one scale, and between two layers the number of connections, each
// with its weight; no line is drawn for each of them. The output is computed
// in the page: the TD net's value; AlphaZero's value and its preference for
// each legal move. A value is the net's output on its −1…+1 scale, for the
// player to move, and the figure says so: it is never a share of games won.
import { key } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { PogoFigure } from '../kit/figure';
import { t, type Lang } from '../kit/strings';
import type { AzNet, TdNet } from '../nets';
import { sharedAz, sharedTd } from '../nets-shared';
import { store, type Store } from '../store';
import { formatCount } from './count-steps';
import { azDiagram, tdDiagram, type Column, type NetDiagram } from './net-layers';
import { netPosition, positionWords } from './net-position';
import { azReadout } from './net-readout';
import { el, netSentence, policyView, positionLine, valueView } from './net-view';
import netCss from './net.css?raw';

export type NetKind = 'td' | 'az';

export function parseKind(attr: string | null): NetKind {
  if (attr === 'td' || attr === 'az') return attr;
  throw new Error(`pogo-net: kind must be td or az, not ${JSON.stringify(attr)}`);
}

/** « 127 entrées », « 128 neurones », « 1 sortie », with what goes in or comes out when there is something to say. */
function layerText(lang: Lang, units: number, role: 'input' | 'hidden' | 'output', what = ''): string {
  const unit = role === 'input' ? t(lang, 'netInputs') : role === 'hidden' ? t(lang, 'netNeurons') : t(lang, units === 1 ? 'netOutput' : 'netOutputs');
  return `${formatCount(lang, units)} ${unit}${what ? ` · ${what}` : ''}`;
}

/**
 * One column of layers as a list: each layer a label and a bar of its units on the
 * diagram's one scale (`widest`), each pair joined by its count of connections.
 * `skipFirst`: a head starts from the trunk's last layer, already drawn above it.
 */
function columnList(lang: Lang, c: Column, widest: number, roles: { first: 'input' | 'hidden'; lastWhat: string }, skipFirst = false): HTMLOListElement {
  const ol = el('ol', 'layers');
  c.layers.forEach((units, i) => {
    if (i > 0) {
      const link = c.links[i - 1]!;
      const li = el('li', 'link');
      li.append(el('span', 'num', `${formatCount(lang, link.inputs)} × ${formatCount(lang, link.outputs)}`), ` ${t(lang, 'netLinks')}`);
      ol.append(li);
    }
    if (i === 0 && skipFirst) return;
    const last = i === c.layers.length - 1;
    const role = i === 0 ? roles.first : last && roles.lastWhat ? 'output' : 'hidden';
    const what = i === 0 && roles.first === 'input' ? t(lang, 'netInputsWhat') : last ? roles.lastWhat : '';
    const li = el('li', `layer ${role}`);
    li.dataset.units = String(units);
    const bar = el('span', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.width = `${((units / widest) * 100).toFixed(3)}%`;
    li.append(el('span', 'layer-name', layerText(lang, units, role, what)), bar);
    ol.append(li);
  });
  return ol;
}

function diagramView(lang: Lang, d: NetDiagram, kind: NetKind): HTMLElement {
  const box = el('div', 'diagram');
  if (kind === 'td') {
    box.append(columnList(lang, d.trunk, d.widest, { first: 'input', lastWhat: t(lang, 'netValueWhat') }));
    return box;
  }
  const trunk = el('section', 'part trunk');
  trunk.append(el('p', 'label part-name', t(lang, 'netTrunk')), columnList(lang, d.trunk, d.widest, { first: 'input', lastWhat: '' }));
  const heads = el('div', 'heads');
  for (const h of d.heads) {
    const part = el('section', `part head ${h.kind}`);
    const lastWhat = t(lang, h.kind === 'policy' ? 'netPolicyWhat' : 'netValueWhat');
    part.append(
      el('p', 'label part-name', t(lang, h.kind === 'policy' ? 'netPolicyHead' : 'netValueHead')),
      columnList(lang, h.column, d.widest, { first: 'hidden', lastWhat }, true),
    );
    heads.append(part);
  }
  box.append(trunk, heads);
  return box;
}

export class PogoNet extends PogoFigure {
  static override fidelity = 'live' as const;
  static override game = 'gameLc12' as const;
  static override styles = netCss;
  /** A floor only: net.css keeps each kind's measured room, by width (`:host([kind])`). */
  static override stageMinHeight = '600px';
  /** The game, the engine and the two nets; a test swaps them. */
  static deps: { store: Store; az: () => Promise<AzNet>; td: () => Promise<TdNet> } = { store, az: sharedAz, td: sharedTd };

  /** The net's size once read, once loaded. */
  private weights: number | undefined;

  /** Which net this is and its size, what its value is not, and the preferences' scale. */
  protected override precisions(): string[] {
    const lang = this.lang;
    const kind = this.getAttribute('kind') === 'az' ? 'az' : 'td';
    const lines = this.weights === undefined ? [] : [netSentence(lang, kind, this.weights)];
    lines.push(t(lang, 'netNotShare'));
    if (kind === 'az') lines.push(t(lang, 'netPrefScale'));
    return lines;
  }

  protected async render(signal: AbortSignal): Promise<void> {
    const kind = parseKind(this.getAttribute('kind'));
    const deps = (this.constructor as typeof PogoNet).deps;
    const [net, { policyIndex }] = await Promise.all([kind === 'az' ? deps.az() : deps.td(), import('../nets'), deps.store.ready()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const diagram = kind === 'az' ? azDiagram(net.header) : tdDiagram(net.header);
    this.weights = diagram.weights;
    this.refreshPrecisions();

    const root = el('div', `net net-${kind}`);
    const where = positionLine(lang);
    const boardSlot = el('div', 'board-slot');
    const body = el('div', 'net-body');
    body.append(boardSlot, diagramView(lang, diagram, kind));
    const value = valueView(lang, t(lang, 'netValue'));
    // A move name explained in the table marks its stack and its landing on the board: the position the net reads.
    let shown: ReturnType<typeof netPosition> | undefined;
    const drawPosition = (move?: { from_cell: number; to_cell: number }): void => {
      if (!shown) return;
      const marks = move ? [{ cell: move.from_cell, kind: 'picked' as const }, { cell: move.to_cell, kind: 'target' as const }] : [];
      boardSlot.replaceChildren(labelledBoard(drawBoard(shown.state, { labelRoom: true, title: positionWords(lang, shown), marks })));
    };
    const policy = kind === 'az' ? policyView(lang, (m) => ({ show: () => drawPosition(m), hide: () => drawPosition() })) : null;
    root.append(where.element, body, value.element, ...(policy ? [policy.element] : []));

    const update = (): void => {
      const p = netPosition(deps.store);
      where.update(p);
      root.dataset.position = key(p.state);
      shown = p;
      drawPosition();
      if (kind === 'az') {
        const r = azReadout(net as AzNet, p.state, policyIndex);
        value.update(r.value, p.state);
        policy!.update(r.rows, r.actions);
      } else {
        value.update((net as TdNet).value(p.state), p.state);
      }
    };
    update();
    const off = deps.store.on('game', update);
    signal.addEventListener('abort', () => void off(), { once: true });
    this.stage.append(root);
  }
}
