// <pogo-search position="puzzle5|reader">: AlphaZero's search on one position
// (fig. 21). « Lancer » runs search() in the page, 100 simulations in batches
// it yields between, so the page stays responsive, and keeps the snapshots it
// emits after 1, 2, 3, 5, 10, 20, 50 and 100 of them (search-steps.ts); the
// figure then steps through them, by itself unless the reader asks for
// reduced motion. Each row is a root move: the net's preference, the visits so
// far and their mean value, the move the search plays marked. The board's
// search runs in a worker that returns only its last snapshot, so this one runs
// on the main thread, on the page's one copy of the net. position="reader" is
// the position <pogo-net> and <pogo-encoding> show, and follows the store.
import { LC1_2, key, legal, moveName, type Move, type State, type Triple } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
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
import { barCell, blankRow, colourName, el, rankedTable } from './net-view';
import netCss from './net.css?raw';
import searchCss from './pogo-search.css?raw';
import { signedNote } from './q-steps';
import { PUZZLE5, SEARCH_SIMS, STOPS, recordSearch, rowOrder, type SearchRun } from './search-steps';

export type SearchPosition = 'puzzle5' | 'reader';

export function parsePosition(attr: string | null): SearchPosition {
  if (attr === 'puzzle5' || attr === 'reader') return attr;
  throw new Error(`pogo-search: position must be puzzle5 or reader, not ${JSON.stringify(attr)}`);
}

/** The search on `s` with `net`, loaded on first use and stated in full: AlphaZero's C_PUCT and the board's lc1-2 rules, never search()'s defaults. */
async function lazySearch(s: State, net: AzNet, o: Parameters<SearchRun>[0]): Promise<SearchSnapshot> {
  const [{ search }, { C_PUCT }] = await Promise.all([import('../mcts'), import('../search-handler')]);
  return search(s, net, { sims: SEARCH_SIMS, cPuct: C_PUCT, rules: LC1_2, onSnapshot: o.onSnapshot, signal: o.signal });
}

/** The root before any simulation: the net's preferences, no visit. */
async function preferences(s: State, net: AzNet): Promise<SearchSnapshot> {
  const { policyIndex } = await import('../nets');
  const { priors } = net.evaluate(s);
  return { sim: 0, root: legal(s).map((move) => ({ move, prior: priors.get(policyIndex(move)) ?? 0, visits: 0, meanValue: 0 })) };
}

/** Text with each move name in a span that keeps it on one line. */
const sims = (lang: Lang, n: number): string => `${formatCount(lang, n)} ${t(lang, n === 1 ? 'searchSim' : 'searchSims')}`;

/** The most visited move, the first in root order among equals (mcts.ts `bestMove`), or none before the search. */
function played(s: SearchSnapshot): number {
  let best = -1;
  s.root.forEach((r, i) => {
    if (r.visits > 0 && (best < 0 || r.visits > s.root[best]!.visits)) best = i;
  });
  return best;
}

/** The words over the table at one step. */
export function snapshotWords(lang: Lang, s: SearchSnapshot, final: boolean): string {
  const order = rowOrder(s);
  const preferred = s.root[order[0]!]!;
  const prefers = `${t(lang, 'searchNetPrefers')} ${moveName(preferred.move)}`;
  if (s.sim === 0) return `${t(lang, 'searchBefore')} ${prefers}.`;
  const best = s.root[played(s)]!;
  return `${sims(lang, s.sim)}${colon(lang)} ${t(lang, final ? 'searchPlays' : 'searchWouldPlay')}, ${moveName(best.move)}. ${prefers}.`;
}

export class PogoSearch extends PogoFigure {
  static override styles = netCss + searchCss;
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
      const before = await preferences(s, net);
      if (current.signal.aborted) return;
      const where = p ? positionWords(lang, p) : `${t(lang, 'position')}${colon(lang)} ${t(lang, 'searchPuzzle')}, ${colourName(lang, s.to_move)} ${t(lang, 'toMove')}.`;
      root.replaceChildren(...this.content(lang, s, where, net, before, current.signal));
      root.dataset.position = k;
    };
    await draw();
    if (which === 'reader') {
      const off = deps.store.on('game', () => void draw());
      signal.addEventListener('abort', () => void off(), { once: true });
    }
  }

  private content(lang: Lang, s: State, where: string, net: AzNet, before: SearchSnapshot, signal: AbortSignal): HTMLElement[] {
    const deps = (this.constructor as typeof PogoSearch).deps;
    const order = rowOrder(before);
    const words = el('p', 'where-from', where);
    const boardSlot = el('div', 'board-slot');
    // A move name explained (the words or the table) marks its stack and its landing on this board, the position searched.
    const drawPosition = (m?: Triple): void => {
      const marks = m ? [{ cell: m[0], kind: 'picked' as const }, { cell: m[2], kind: 'target' as const }] : [];
      boardSlot.replaceChildren(labelledBoard(drawBoard(s, { labelRoom: true, title: where, marks })));
    };
    const hooks = (m: Triple | Move): TipHooks => ({ show: () => drawPosition(asTriple(m)), hide: () => drawPosition() });
    drawPosition();

    // The words of every step, written into one grid cell: the area keeps the room of the longest.
    const status = el('div', 'status');
    const said = el('p', 'said-now');
    const sizers = [snapshotWords(lang, before, false), ...STOPS.map((n) => `${sims(lang, n)}${colon(lang)} ${t(lang, 'searchWouldPlay')}, a1-3-c3. ${t(lang, 'searchNetPrefers')} a1-3-c3.`)].map((text) => {
      const p = el('p', 'sizer', text);
      p.setAttribute('aria-hidden', 'true');
      return p;
    });
    said.setAttribute('role', 'status');
    said.setAttribute('aria-live', 'polite');
    status.append(...sizers, said);

    const ranked = rankedTable(
      lang,
      'search',
      ([
        ['netMove', 'move'],
        ['searchPrior', 'share'],
        ['searchVisits', 'visits'],
        ['searchMean', 'mean'],
      ] as const).map(([k, cls]) => ({ text: t(lang, k), cls })),
    );
    const table = ranked.element;

    const show = (snap: SearchSnapshot, final: boolean): void => {
      // The words and rows are rebuilt: a mark left by an explanation they held goes with them.
      drawPosition();
      said.replaceChildren(...moveText(lang, snapshotWords(lang, snap, final), hooks));
      ranked.caption.textContent = `${t(lang, 'searchMoves')} ${sims(lang, snap.sim)}`;
      const best = played(snap);
      ranked.update(
        order,
        best < 0 ? null : best,
        (i) => {
          const r = snap.root[i]!;
          const tr = el('tr');
          tr.dataset.move = moveName(r.move);
          const th = el('th', 'move num');
          th.scope = 'row';
          th.append(moveTip(lang, r.move, hooks(r.move)));
          if (i === best) {
            tr.classList.add('played');
            th.append(' ', el('span', 'label tag', t(lang, final ? 'searchPlayed' : 'searchLeading')));
          }
          tr.append(
            th,
            barCell(formatShare(lang, r.prior), r.prior),
            barCell(String(r.visits), r.visits / SEARCH_SIMS, 'visits'),
            el('td', 'mean num', r.visits === 0 ? '—' : signedNote(lang, r.meanValue)),
          );
          return tr;
        },
        () => {
          const tr = blankRow(3);
          tr.append(el('td', 'mean num', '\u00a0'));
          return tr;
        },
        (i) => snap.root[i]!.prior,
      );
    };
    show(before, false);


    // The controls: « Lancer » and « Jouer cette position contre l’ordinateur » until the search has run, then its steps.
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
      let kept: SearchSnapshot[];
      try {
        kept = await recordSearch((o) => deps.search(s, net, o), signal);
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
      const frames = [before, ...kept];
      const last = frames.length - 1;
      running = false;
      const steps = new Stepper(frames.length, (i) => show(frames[i]!, i === last), { signal, interval: 1100 });
      stepper = steps;
      const row = transport(steps, {
        lang,
        counter: (i) => `${sims(lang, frames[i]!.sim)} ${t(lang, 'outOf')} ${formatCount(lang, SEARCH_SIMS)}`,
        actions: [{ label: t(lang, 'playFromHere'), onClick: playFrom }],
      });
      controls.replaceChildren(row);
      steps.go(1);
      // Under reduced motion `play` does nothing: the reader steps. Off screen it waits for the figure to come back.
      if (!heldOffScreen) steps.play();
    };
    // On screen, the search runs by itself; under reduced motion it waits for « Lancer ».
    autoplay(this, playable, { signal });

    // The bars' and the mean value's scales: the table cannot be read without them.
    const lower = (x: string): string => x.charAt(0).toLowerCase() + x.slice(1);
    const scales = [
      `${t(lang, 'searchBars')} ${formatCount(lang, SEARCH_SIMS)}.`,
      `${t(lang, 'searchMean')}${colon(lang)} ${lower(t(lang, 'netScaleFrom'))} (${colourName(lang, s.to_move)}).`,
    ].map((text) => el('p', 'note scale-note', text));
    return [words, boardSlot, status, table, controls, ...scales];
  }
}
