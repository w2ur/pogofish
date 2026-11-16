// <pogo-search position="puzzle5|reader">: AlphaZero's search on one position
// (fig. 21). On screen it runs search() in the page (100 simulations, the
// board's normal level, in batches it yields between), recording every
// snapshot and what every simulation did (mcts.ts traces), then plays it back
// (search-script.ts): the first three simulations one by one and slowly, each
// as its path (the root move's arrow on the board, the moves after it named
// under it), where it stops and the note brought back from there, and that
// note travelling to the root move's row, whose visits and mean value change;
// then the search accelerating through 5, 10, 20, 50 and 100 simulations, with
// one deeper simulation slowed down in its place (the first to reach the end of
// a game); then the most visited move, played on the board. The rows stay in
// the order of the net's preference, so the reader watches the move it did not
// prefer overtake the others. The visits are red when Red is to move (red is
// the Red side), ink otherwise. Under reduced motion it waits for « Lancer »,
// showing the position and the net's preferences, and the reader steps.
// position="reader" is the position <pogo-net> and <pogo-encoding> show, and
// follows the store.
import { LC1_2, key, legal, moveName, play, type Move, type State, type Triple } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { animateMove, cellCentre, drawBoard } from '../kit/board-svg';
import { autoplay, type Playable } from '../kit/autoplay';
import { controlButton, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { formatShare } from '../kit/score';
import { Stepper } from '../kit/stepper';
import { asTriple, moveText, moveTip, type TipHooks } from '../kit/move-tip';
import { colon, t, type Lang } from '../kit/strings';
import type { SearchSnapshot } from '../mcts';
import type { AzNet } from '../nets';
import { sharedAz } from '../nets-shared';
import { store, type Store } from '../store';
import { formatCount } from './count-steps';
import { netPosition, positionWords } from './net-position';
import { colourName, el } from './net-view';
import searchCss from './pogo-search.css?raw';
import { signedNote } from './q-steps';
import { frameCounter, frameHold, frameWords, mostVisited, leader, noteFor, rootRow, searchScript, WALK_MS, type Frame } from './search-script';
import { PUZZLE5, SEARCH_SIMS, recordFull, rowOrder, type SearchRun } from './search-steps';

export type SearchPosition = 'puzzle5' | 'reader';

/** At most this many rows: past it, the net's least preferred moves are summed in one line. */
export const MAX_ROWS = 15;
/** The board's side, in CSS pixels. */
const BOARD = 264;
const NS = 'http://www.w3.org/2000/svg';

export function parsePosition(attr: string | null): SearchPosition {
  if (attr === 'puzzle5' || attr === 'reader') return attr;
  throw new Error(`pogo-search: position must be puzzle5 or reader, not ${JSON.stringify(attr)}`);
}

/** The search on `s` with `net`, loaded on first use and stated in full: AlphaZero's C_PUCT and the board's lc1-2 rules, never search()'s defaults. */
async function lazySearch(s: State, net: AzNet, o: Parameters<SearchRun>[0]): Promise<SearchSnapshot> {
  const [{ search }, { C_PUCT }] = await Promise.all([import('../mcts'), import('../search-handler')]);
  return search(s, net, { sims: SEARCH_SIMS, cPuct: C_PUCT, rules: LC1_2, onSnapshot: o.onSnapshot, onTrace: o.onTrace, signal: o.signal });
}

/** The root before any simulation: the net's preferences, no visit. */
async function preferences(s: State, net: AzNet): Promise<SearchSnapshot> {
  const { policyIndex } = await import('../nets');
  const { priors } = net.evaluate(s);
  return { sim: 0, root: legal(s).map((move) => ({ move, prior: priors.get(policyIndex(move)) ?? 0, visits: 0, meanValue: 0 })) };
}

/** « 1 simulation », « 5 simulations »; in French 0 is singular too. */
const sims = (lang: Lang, n: number): string => `${formatCount(lang, n)} ${t(lang, n === 1 || (lang === 'fr' && n === 0) ? 'searchSim' : 'searchSims')}`;

/**
 * The rows shown: every root move when there are at most MAX_ROWS, else the net's
 * MAX_ROWS − 1 preferred ones and the move the search plays in the end, in the net's order.
 */
export function shownRows(before: SearchSnapshot, last: SearchSnapshot | null): number[] {
  const order = rowOrder(before);
  if (order.length <= MAX_ROWS) return order;
  const keep = new Set(order.slice(0, MAX_ROWS - 1));
  const played = last ? mostVisited(last) : -1;
  keep.add(played >= 0 && !keep.has(played) ? played : order[MAX_ROWS - 1]!);
  return order.filter((i) => keep.has(i));
}

/** An arrow from the centre of one cell to another, drawn into a board with labelRoom. */
function arrow(svg: SVGSVGElement, from: number, to: number): void {
  const [x1, y1] = cellCentre(from, true);
  const [x2, y2] = cellCentre(to, true);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  // It leaves the stack's edge and stops short of the landing, so neither is hidden.
  const sx = x1 + ux * 30;
  const sy = y1 + uy * 30;
  const ex = x2 - ux * 30;
  const ey = y2 - uy * 30;
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'path-arrow');
  const line = (cls: string): SVGLineElement => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('class', cls);
    l.setAttribute('x1', String(sx));
    l.setAttribute('y1', String(sy));
    l.setAttribute('x2', String(ex - ux * 10));
    l.setAttribute('y2', String(ey - uy * 10));
    return l;
  };
  const head = (cls: string): SVGPolygonElement => {
    const p = document.createElementNS(NS, 'polygon');
    p.setAttribute('class', cls);
    const px = -uy;
    const py = ux;
    p.setAttribute('points', `${ex},${ey} ${ex - ux * 18 + px * 10},${ey - uy * 18 + py * 10} ${ex - ux * 18 - px * 10},${ey - uy * 18 - py * 10}`);
    return p;
  };
  g.append(line('halo'), head('halo'), line('shaft'), head('tip'));
  svg.append(g);
}

interface Row {
  tr: HTMLTableRowElement;
  index: number;
  prior: HTMLElement;
  visitsBar: HTMLElement;
  visits: HTMLElement;
  mean: HTMLElement;
  tag: HTMLElement;
}

export class PogoSearch extends PogoFigure {
  static override styles = searchCss;
  static override stageMinHeight = '900px';

  /** The game, the engine, the net and the search; a test swaps them. */
  static deps: {
    store: Store;
    az: () => Promise<AzNet>;
    search: (s: State, net: AzNet, o: Parameters<SearchRun>[0]) => Promise<SearchSnapshot>;
  } = { store, az: sharedAz, search: lazySearch };

  protected async render(signal: AbortSignal): Promise<void> {
    const which = parsePosition(this.getAttribute('position'));
    const deps = (this.constructor as typeof PogoSearch).deps;
    const [net] = await Promise.all([deps.az(), deps.store.ready()]);
    if (signal.aborted) return;
    const lang = this.lang;
    const root = el('div', 'search');
    this.stage.append(root);

    let run: AbortController | undefined;
    signal.addEventListener('abort', () => run?.abort(), { once: true });
    let shownKey: string | undefined;

    const draw = async (): Promise<void> => {
      const p = which === 'reader' ? netPosition(deps.store) : null;
      const s = p ? p.state : PUZZLE5;
      const k = key(s);
      if (k === shownKey) return;
      shownKey = k;
      // A new position: the search in flight, if any, is for the old one.
      run?.abort();
      const current = new AbortController();
      run = current;
      signal.addEventListener('abort', () => current.abort(), { once: true });
      const before = await preferences(s, net);
      if (current.signal.aborted) return;
      const where = p ? positionWords(lang, p) : `${t(lang, 'position')}${colon(lang)} ${t(lang, 'searchPuzzle')}, ${colourName(lang, s.to_move)} ${t(lang, 'toMove')}.`;
      root.replaceChildren(...this.content(lang, s, where, net, before, current.signal, root));
      root.dataset.position = k;
      root.dataset.side = s.to_move === 'Red' ? 'red' : 'white';
    };
    await draw();
    if (which === 'reader') {
      const off = deps.store.on('game', () => void draw());
      signal.addEventListener('abort', () => void off(), { once: true });
    }
  }

  private content(lang: Lang, s: State, where: string, net: AzNet, before: SearchSnapshot, signal: AbortSignal, root: HTMLElement): HTMLElement[] {
    const deps = (this.constructor as typeof PogoSearch).deps;
    const reduced = (): boolean => this.reducedMotion();
    const words = el('p', 'where-from', where);

    // ---- the board, and what is drawn on it.
    const boardSlot = el('div', 'board-slot');
    let showBoard: () => void = () => undefined;
    const put = (svg: SVGSVGElement): SVGSVGElement => {
      boardSlot.replaceChildren(labelledBoard(svg));
      return svg;
    };
    const board = (st: State, o: { marks?: Triple; arrow?: Move; from?: number; to?: number; moving?: number } = {}): SVGSVGElement => {
      const marks = o.marks ? [{ cell: o.marks[0], kind: 'picked' as const }, { cell: o.marks[2], kind: 'target' as const }] : [];
      const svg = drawBoard(st, { size: BOARD, labelRoom: true, title: where, marks, from: o.from, to: o.to, moving: o.moving });
      if (o.arrow) arrow(svg, o.arrow.from_cell, o.arrow.to_cell);
      return svg;
    };
    // A root move's name explained marks its stack and landing on the position searched; leaving it restores the frame's board.
    const hooks = (m: Triple | Move): TipHooks => ({ show: () => void put(board(s, { marks: asTriple(m) })), hide: () => showBoard() });

    // ---- the path under the board: its moves, where it stopped, and the note it brings back.
    const path = el('div', 'path');
    path.setAttribute('aria-hidden', 'true');
    const pathLabel = el('span', 'label path-label', t(lang, 'searchPathLabel'));
    const chain = el('span', 'chain');
    const leafTag = el('span', 'leaf-tag');
    const note = el('span', 'chip');
    const noteWho = el('span', 'note-for');
    const noteValue = el('span', 'note-value num');
    note.append(noteWho, noteValue);
    path.append(pathLabel, chain, leafTag, note);
    path.toggleAttribute('data-off', true);
    let steps: HTMLElement[] = [];

    // ---- the words of the frame: one cell for every frame, so nothing under it moves.
    const status = el('div', 'status');
    const said = el('p', 'said-now');
    said.setAttribute('role', 'status');
    said.setAttribute('aria-live', 'polite');
    status.append(said);

    // ---- the table: one row per root move, in the net's order, updated in place so its bars can grow.
    const table = el('table', 'search-table');
    const caption = el('caption', 'say');
    const thead = el('thead');
    const head = el('tr');
    for (const [k, cls] of [
      ['netMove', 'move'],
      ['searchPrior', 'prior'],
      ['searchVisits', 'visits'],
      ['searchMean', 'mean'],
    ] as const) {
      const th = el('th', `label ${cls}`, t(lang, k));
      th.scope = 'col';
      head.append(th);
    }
    thead.append(head);
    const tbody = el('tbody');
    table.append(caption, thead, tbody);
    let rows: Row[] = [];
    const others = el('p', 'note others');
    const buildRows = (indices: number[]): void => {
      rows = indices.map((index) => {
        const r = before.root[index]!;
        const tr = el('tr');
        tr.dataset.move = moveName(r.move);
        const th = el('th', 'move num');
        th.scope = 'row';
        const tag = el('span', 'tag');
        th.append(moveTip(lang, r.move, hooks(r.move)), tag);
        const bar = (cls: string, share: number): { cell: HTMLTableCellElement; bar: HTMLElement; value: HTMLElement } => {
          const cell = el('td', cls);
          const line = el('div', 'line');
          const track = el('div', 'track');
          track.setAttribute('aria-hidden', 'true');
          const b = el('div', 'bar');
          b.style.width = `${(share * 100).toFixed(2)}%`;
          track.append(b);
          const value = el('span', 'value num');
          line.append(value, track);
          cell.append(line);
          return { cell, bar: b, value };
        };
        const prior = bar('prior', r.prior);
        prior.value.textContent = formatShare(lang, r.prior);
        const visits = bar('visits', 0);
        const mean = el('td', 'mean num');
        tr.append(th, prior.cell, visits.cell, mean);
        tbody.append(tr);
        return { tr, index, prior: prior.value, visitsBar: visits.bar, visits: visits.value, mean, tag };
      });
      const hidden = before.root.map((_, i) => i).filter((i) => !indices.includes(i));
      others.hidden = hidden.length === 0;
      if (hidden.length) {
        const share = hidden.reduce((a, i) => a + before.root[i]!.prior, 0);
        others.textContent = `${t(lang, 'movesOthersBefore')} ${hidden.length} ${t(lang, 'movesOthersAfter')}, ${formatShare(lang, share)} ${t(lang, 'movesOthersShare')}`;
      }
    };
    const fill = (snap: SearchSnapshot, o: { fresh?: number; final?: boolean } = {}): void => {
      caption.textContent = snap.sim === 0 ? t(lang, 'searchMovesBefore') : `${t(lang, 'searchMoves')} ${sims(lang, snap.sim)}`;
      const lead = o.final ? mostVisited(snap) : leader(snap);
      for (const row of rows) {
        const r = snap.root[row.index]!;
        row.visits.textContent = String(r.visits);
        row.visitsBar.style.width = `${((r.visits / SEARCH_SIMS) * 100).toFixed(2)}%`;
        row.mean.textContent = r.visits === 0 ? '—' : signedNote(lang, r.meanValue);
        const marked = row.index === lead;
        row.tr.classList.toggle('played', marked);
        row.tag.textContent = marked ? ` ${t(lang, o.final ? 'searchPlayed' : 'searchLeading')}` : '';
        row.tr.toggleAttribute('data-fresh', row.index === o.fresh);
      }
    };
    buildRows(shownRows(before, null));
    fill(before);

    // ---- what each frame shows.
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = (): void => {
      for (const id of timers) clearTimeout(id);
      timers = [];
      note.getAnimations?.().forEach((a) => a.cancel());
    };
    signal.addEventListener('abort', clearTimers, { once: true });
    const rootBoard = (): void => {
      showBoard = () => void put(board(s));
      showBoard();
    };
    rootBoard();
    said.replaceChildren(...moveText(lang, frameWords(lang, { kind: 'before', sim: 0, snap: before }, s.to_move), hooks));

    let frames: Frame[] = [];
    let shown = 0;
    const show = (i: number): void => {
      const f = frames[i]!;
      const forward = i === shown + 1 && !reduced();
      shown = i;
      clearTimers();
      const say = (): void => void said.replaceChildren(...moveText(lang, frameWords(lang, f, s.to_move), hooks));
      // A leaf is said once the board has reached it.
      if (!(forward && f.kind === 'leaf')) say();
      root.dataset.frame = f.kind;
      const isSim = f.kind === 'path' || f.kind === 'leaf' || f.kind === 'back';
      path.toggleAttribute('data-off', !isSim);
      fill(f.snap, { fresh: f.kind === 'back' ? rootRow(f.snap, f.trace) : undefined, final: f.kind === 'end' });
      if (isSim) {
        const tr = f.trace;
        // The path's moves, from the root.
        chain.replaceChildren();
        steps = tr.moves.map((m, k) => {
          const step = el('span', 'step move-name', moveName(m));
          if (k > 0) chain.append(el('span', 'sep', '→'));
          chain.append(step);
          return step;
        });
        leafTag.textContent = t(lang, tr.leaf === 'end' ? 'searchTagEnd' : tr.leaf === 'new' ? 'searchTagNew' : 'searchTagRepeat');
        noteWho.textContent = `${t(lang, 'searchNoteFor')} ${colourName(lang, s.to_move)}`;
        noteValue.textContent = noteFor(lang, tr.value);
        path.dataset.stage = f.kind;
        note.toggleAttribute('data-gone', false);
        const states = tr.moves.reduce<State[]>((acc, m) => [...acc, play(acc.at(-1)!, m)], [s]);
        if (f.kind === 'path') {
          steps.forEach((st, k) => st.toggleAttribute('data-on', k === 0));
          showBoard = () => void put(board(s, { arrow: tr.moves[0] }));
          showBoard();
        } else if (f.kind === 'leaf') {
          const end = (): void => {
            const m = tr.moves.at(-1)!;
            showBoard = () => void put(board(states.at(-1)!, { from: m.from_cell, to: m.to_cell, moving: m.num_pieces }));
            showBoard();
            steps.forEach((st) => st.toggleAttribute('data-on', true));
            path.dataset.stage = 'leaf';
            say();
          };
          if (forward) {
            // The board walks the path, one move every WALK_MS, then the note appears where it stopped.
            path.dataset.stage = 'walk';
            steps.forEach((st) => st.toggleAttribute('data-on', false));
            tr.moves.forEach((m, k) => {
              timers.push(
                setTimeout(() => {
                  const from = boardSlot.querySelector('svg') as SVGSVGElement;
                  const after = put(board(states[k + 1]!, { from: m.from_cell, to: m.to_cell, moving: m.num_pieces }));
                  animateMove(from, after, asTriple(m));
                  steps[k]?.toggleAttribute('data-on', true);
                }, WALK_MS * k),
              );
            });
            timers.push(setTimeout(end, WALK_MS * tr.moves.length));
          } else {
            end();
          }
        } else {
          // Back at the root: the note travels to the root move's row.
          steps.forEach((st) => st.toggleAttribute('data-on', true));
          showBoard = () => void put(board(s, { arrow: tr.moves[0] }));
          showBoard();
          const target = rows.find((r) => r.index === rootRow(f.snap, tr));
          const flies = forward && target !== undefined && typeof note.animate === 'function';
          // Without the flight the note has nothing to show here: its row says it.
          note.toggleAttribute('data-gone', !flies);
          if (flies && target) {
            const a = note.getBoundingClientRect();
            const b = target.mean.getBoundingClientRect();
            const dx = b.left + b.width / 2 - (a.left + a.width / 2);
            const dy = b.top + b.height / 2 - (a.top + a.height / 2);
            const flight = note.animate(
              [
                { transform: 'translate(0, 0)', opacity: 1 },
                { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 0.8 },
                { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
              ],
              { duration: 1200, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
            );
            // A flight cut short by the next frame is cancelled, which rejects this promise: nothing waits on it.
            flight.finished?.catch(() => undefined);
          }
        }
      } else if (f.kind === 'end') {
        const best = f.snap.root[mostVisited(f.snap)]!.move;
        const after = (): SVGSVGElement => board(play(s, best), { from: best.from_cell, to: best.to_cell, moving: best.num_pieces });
        showBoard = () => void put(after());
        if (forward) {
          const from = put(board(s));
          timers.push(
            setTimeout(() => {
              const to = put(after());
              animateMove(from, to, asTriple(best));
            }, 400),
          );
        } else {
          showBoard();
        }
      } else {
        rootBoard();
      }
    };

    // ---- the controls: « Lancer » and « Jouer cette position contre l’ordinateur » until the search has run, then its steps.
    const controls = el('div', 'search-controls');
    const playFrom = (): void => this.playFrom(s, t(lang, 'searchLabel'));
    const launch = controlButton(t(lang, 'searchRun'), () => void start());
    launch.dataset.role = 'run';
    const fromHere = controlButton(t(lang, 'playFromHere'), playFrom, true);
    fromHere.dataset.role = 'play-from';
    const first = el('div', 'controls');
    first.append(launch, fromHere);
    controls.append(first);

    // Autoplay drives « Lancer » until the search has run, then its steps.
    let stepper: Stepper | undefined;
    let running = false;
    let heldOffScreen = false;
    const playable: Playable = {
      get playing() {
        return stepper ? stepper.playing : running;
      },
      get readerPaused() {
        return stepper?.readerPaused ?? false;
      },
      play() {
        heldOffScreen = false;
        if (stepper) stepper.play();
        else if (!running) void start();
      },
      pause() {
        if (stepper) stepper.pause();
        else heldOffScreen = true;
      },
    };

    const start = async (): Promise<void> => {
      running = true;
      launch.disabled = true;
      launch.textContent = t(lang, 'searchRunning');
      let recorded: Awaited<ReturnType<typeof recordFull>>;
      try {
        recorded = await recordFull((o) => deps.search(s, net, o), signal);
      } catch (error) {
        if (signal.aborted) return;
        console.error('pogo-search: search failed', error);
        said.textContent = t(lang, 'searchStopped');
        running = false;
        launch.disabled = false;
        launch.textContent = t(lang, 'searchRun');
        return;
      }
      if (signal.aborted) return;
      frames = searchScript(before, recorded.snaps, recorded.traces);
      // The move played in the end keeps a row, however low the net ranked it.
      tbody.replaceChildren();
      buildRows(shownRows(before, recorded.snaps.at(-1)!));
      fill(before);
      // Every frame's words in one cell, so the area keeps the room of the longest.
      status.replaceChildren(
        ...frames.map((f) => {
          const p = el('p', 'sizer', frameWords(lang, f, s.to_move));
          p.setAttribute('aria-hidden', 'true');
          return p;
        }),
        said,
      );
      running = false;
      const steps = new Stepper(frames.length, show, { signal, hold: (i) => frameHold(frames, i) });
      stepper = steps;
      const row = transport(steps, {
        lang,
        counter: (i) => frameCounter(lang, frames[i]!, SEARCH_SIMS),
        actions: [{ label: t(lang, 'playFromHere'), onClick: playFrom }],
      });
      controls.replaceChildren(row);
      if (reduced()) steps.go(1);
      // Under reduced motion `play` does nothing: the reader steps. Off screen it waits for the figure to come back.
      else if (!heldOffScreen) steps.play();
    };
    // On screen, the search runs by itself; under reduced motion it waits for « Lancer ».
    autoplay(this, playable, { signal });

    // The bars' and the mean value's scales: the table cannot be read without them.
    const lower = (x: string): string => x.charAt(0).toLowerCase() + x.slice(1);
    const scales = [
      `${t(lang, 'searchBars')} ${formatCount(lang, SEARCH_SIMS)}.`,
      `${t(lang, 'searchMean')}${colon(lang)} ${lower(t(lang, 'netScaleFrom'))} (${colourName(lang, s.to_move)}).`,
    ].map((text) => el('p', 'note scale-note', text));

    const left = el('div', 'board-col');
    left.append(boardSlot, path, status, controls);
    const right = el('div', 'table-col');
    right.append(table, others, ...scales);
    return [words, left, right];
  }
}

