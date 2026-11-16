// <pogo-openings>: White's sixteen first moves, then every reply Red has after
// the chosen one, each with the solved table's verdict in words
// (openings-verdicts.ts). The reader chooses a move from the list, or on the
// board itself as on the playable board: tap a stack, its count, a
// destination. The board shows the position the choice is made in and the
// chosen move on it; « Réponses des Rouges » plays the chosen opening and
// lists Red's replies; « Jouer d’ici » hands the position after the chosen
// moves to the playable board. The verdicts are game A's, as the label says.
import { boardInput, type BoardInput } from '../board-input';
import { announceMove, chooseCount, describeCell, origins, tap, type Selection } from '../board-state';
import { WASM_FILE, assetUrl } from '../assets';
import type { TableData } from '../data';
import { legal, moveName, parseMoveName, play, ready, type Move, type Triple } from '../engine';
import { boardLabels } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { choiceGroup, controlButton, type ChoiceGroup } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { colon, t, type Lang } from '../kit/strings';
import { sharedTable, TABLE_SOURCE } from '../table';
import { reach, reachText } from './moves-reach';
import { choicesAfter, headLine, sameMove, verdictText, type Choices } from './openings-verdicts';
import openingsCss from './pogo-openings.css?raw';

type CountValue = '1' | '2' | '3';

/** The longest of `xs`, for a sizer that holds a text area at one height. */
const longest = (xs: string[]): string => xs.reduce((a, b) => (b.length > a.length ? b : a), '');

/** « Blanc joue a1-1-b1 : garde la nulle ». */
function verdictLine(lang: Lang, c: Choices, m: Triple): string {
  const found = c.moves.find((x) => sameMove(x.move, m));
  if (!found) throw new Error(`pogo-openings: ${moveName(m)} is not in the list`);
  return `${announceMove(lang, c.mover, m)}${colon(lang)} ${verdictText(lang, found.verdict)}`;
}

interface Ui {
  head: HTMLElement;
  svg: SVGSVGElement;
  input: BoardInput;
  count: ChoiceGroup<CountValue>;
  listSlot: HTMLElement;
  list: ChoiceGroup<string> | undefined;
  readout: HTMLElement;
  level: HTMLButtonElement;
  playHere: HTMLButtonElement;
}

export class PogoOpenings extends PogoFigure {
  static override fidelity = 'measured' as const;
  static override source = TABLE_SOURCE;
  static override game = 'gameA' as const;
  static override styles = openingsCss;
  static override stageMinHeight = '560px';

  /** The engine and the table; a test swaps them. */
  static deps: { engine: () => Promise<void>; table: () => Promise<TableData> } = {
    engine: () => ready(assetUrl(WASM_FILE)),
    table: sharedTable,
  };

  private table: TableData | undefined;
  private ui: Ui | undefined;
  /** The opening whose replies are listed; null while the openings are. */
  private opening: Triple | null = null;
  /** The move chosen in the list shown: an opening, or a reply. */
  private chosen: Triple | null = null;
  private selection: Selection = null;

  protected async render(signal: AbortSignal): Promise<void> {
    const deps = (this.constructor as typeof PogoOpenings).deps;
    const [table] = await Promise.all([deps.table(), deps.engine()]);
    if (signal.aborted) return;
    const lang = this.lang;
    this.table = table;
    this.opening = null;
    this.chosen = null;
    this.selection = null;

    // Fails here, before anything is drawn, if any list disagrees with legal().
    const openings = choicesAfter(table, null);
    const replyLists = openings.moves.map((o) => choicesAfter(table, o.move));

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    /** A text area that keeps the height of its longest text: the live line over an invisible sizer. */
    const held = (className: string, sizer: string): { box: HTMLElement; line: HTMLElement } => {
      const box = el('div', `held ${className}`);
      const size = el('p', 'sizer', sizer);
      size.setAttribute('aria-hidden', 'true');
      const line = el('p', 'line');
      box.append(size, line);
      return { box, line };
    };

    const root = el('div', 'openings');
    const head = held(
      'head label',
      longest([headLine(lang, table, null), ...openings.moves.map((o) => headLine(lang, table, o.move))]),
    );
    const readout = held(
      'readout',
      longest([
        t(lang, 'openingsPick'),
        ...openings.moves.map((o) => verdictLine(lang, openings, o.move)),
        ...replyLists.flatMap((c) => c.moves.map((r) => verdictLine(lang, c, r.move))),
      ]),
    );
    readout.line.setAttribute('aria-live', 'polite');
    // The list is labelled by the same words: assistive tech reads them there, once.
    head.box.setAttribute('aria-hidden', 'true');

    const play_ = el('div', 'play');
    const svg = drawBoard(openings.position, { labelRoom: true });
    const input = boardInput({
      label: t(lang, 'board'),
      onCell: (i) => this.onCell(i),
      keys: root,
      lifted: () => this.selection !== null,
      onCount: (n) => {
        this.selection = chooseCount(this.selection, this.moves(), n);
        this.update();
      },
      onDrop: () => {
        this.selection = null;
        this.update();
      },
    });
    play_.append(svg, boardLabels(), input.grid);

    const count = choiceGroup<CountValue>({
      label: `${t(lang, 'pieces')}${colon(lang)}`,
      id: 'openings-counts-label',
      choices: (['1', '2', '3'] as const).map((n) => ({ value: n, label: n })),
      onChoose: (n) => {
        this.selection = chooseCount(this.selection, this.moves(), Number(n));
        this.update();
      },
    });
    count.element.classList.add('counts');

    const boardCol = el('div', 'board-col');
    boardCol.append(play_, count.element);
    const listSlot = el('div', 'list-slot');
    const body = el('div', 'body');
    body.append(boardCol, listSlot);

    const level = controlButton('', () => this.switchLevel());
    level.dataset.role = 'level';
    const playHere = controlButton(t(lang, 'playFromHere'), () => this.playHere(), true);
    playHere.dataset.role = 'play-from-here';
    const row = el('div', 'controls');
    row.append(level, playHere);

    root.append(head.box, body, readout.box, row);
    this.ui = {
      head: head.line,
      svg,
      input,
      count,
      listSlot,
      list: undefined,
      readout: readout.line,
      level,
      playHere,
    };
    signal.addEventListener('abort', () => (this.ui = undefined), { once: true });
    this.stage.append(root);
    this.buildList();
    this.update();
  }

  private choices(): Choices {
    return choicesAfter(this.table!, this.opening);
  }

  private moves(): Move[] {
    return legal(this.choices().position);
  }

  /** The list of the level shown, rebuilt when the level changes. */
  private buildList(): void {
    const ui = this.ui;
    if (!ui) return;
    const lang = this.lang;
    const c = this.choices();
    const list = choiceGroup<string>({
      label: headLine(lang, this.table!, this.opening),
      id: 'openings-list-label',
      choices: c.moves.map((m) => ({ value: moveName(m.move), label: moveName(m.move) })),
      onChoose: (name) => this.choose(parseMoveName(name)),
    });
    list.element.classList.add('list');
    list.buttons.forEach((b, k) => {
      const v = c.moves[k]!.verdict;
      const move = document.createElement('span');
      move.className = 'mv';
      move.textContent = b.textContent;
      const comma = document.createElement('span');
      comma.className = 'sr';
      comma.textContent = ', ';
      const verdict = document.createElement('span');
      verdict.className = 'verdict';
      verdict.textContent = verdictText(lang, v);
      verdict.toggleAttribute('data-holds', v.kind !== 'loses-in');
      b.replaceChildren(move, comma, verdict);
    });
    ui.listSlot.replaceChildren(list.element);
    ui.list = list;
  }

  private choose(m: Triple): void {
    this.chosen = m;
    this.selection = null;
    this.update();
  }

  private switchLevel(): void {
    if (this.opening === null) {
      if (!this.chosen) return;
      this.opening = this.chosen;
      this.chosen = null;
    } else {
      this.chosen = this.opening;
      this.opening = null;
    }
    this.selection = null;
    this.buildList();
    this.update();
  }

  private playHere(): void {
    const c = this.choices();
    const state = this.chosen ? play(c.position, this.chosen) : c.position;
    const names = [this.opening, this.chosen].filter((m): m is Triple => m !== null).map(moveName);
    this.playFrom(state, names.length ? `${t(this.lang, 'openingsName')}, ${names.join(' ')}` : t(this.lang, 'openingsName'));
  }

  private onCell(i: number): void {
    const r = tap(this.selection, this.moves(), i);
    if ('play' in r) {
      this.choose(r.play);
      return;
    }
    this.selection = r.selection;
    this.update();
  }

  private update(): void {
    const ui = this.ui;
    if (!ui) return;
    const lang = this.lang;
    const c = this.choices();
    const moves = this.moves();
    const sel = this.selection;
    const chosen = this.chosen;
    const lift = origins(moves);
    const options = sel ? reach(moves, sel.from) : [];
    const land = options.find((o) => o.count === sel?.count)?.cells ?? [];

    let marks: { cell: number; kind: 'target' | 'picked' }[];
    if (sel) marks = [{ cell: sel.from, kind: 'picked' }, ...land.map((cell) => ({ cell, kind: 'target' as const }))];
    else if (chosen) marks = [{ cell: chosen[0], kind: 'picked' }];
    else marks = lift.map((cell) => ({ cell, kind: 'target' as const }));
    const svg = drawBoard(c.position, {
      labelRoom: true,
      marks,
      // The chosen move's destination is framed; its pieces have not moved yet.
      ...(chosen && !sel ? { to: chosen[2], moving: 0 } : {}),
    });
    ui.svg.replaceWith(svg);
    ui.svg = svg;

    ui.input.cells.forEach((b, i) => {
      const mark = sel?.from === i ? 'selected' : land.includes(i) ? 'target' : !sel && lift.includes(i) ? 'can-lift' : null;
      const actionable = mark !== null || lift.includes(i);
      b.setAttribute('aria-label', describeCell(lang, c.position, i, mark));
      b.toggleAttribute('data-actionable', actionable);
      b.setAttribute('aria-disabled', String(!actionable));
    });
    ui.input.syncFocus();

    const available = options.map((o) => o.count);
    ui.count.element.toggleAttribute('data-off', sel === null);
    ui.count.buttons.forEach((b, k) => (b.hidden = !available.includes(k + 1)));
    ui.count.set(sel ? (String(sel.count) as CountValue) : null);

    ui.list?.set(chosen ? moveName(chosen) : null);
    ui.head.textContent = headLine(lang, this.table!, this.opening);

    if (sel) ui.readout.textContent = reachText(lang, sel.from, sel.count, land);
    else if (chosen) ui.readout.textContent = verdictLine(lang, c, chosen);
    else ui.readout.textContent = t(lang, 'openingsPick');

    const first = this.opening === null;
    ui.level.textContent = t(lang, first ? 'openingsShowReplies' : 'openingsBack');
    // A disabled button drops focus to the page: keep it on the list's tab stop instead.
    const focused = this.shadowRoot?.activeElement === ui.level;
    ui.level.disabled = first && chosen === null;
    if (focused && ui.level.disabled) ui.list?.buttons.find((b) => b.tabIndex === 0)?.focus();
    // One primary per row: going on to the replies, then playing from them.
    ui.level.classList.toggle('secondary', !first);
    ui.playHere.classList.toggle('secondary', first);
  }
}
