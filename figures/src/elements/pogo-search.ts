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
import { NET_NAME } from '../assets';
import { LC1_2, key, legal, moveName, type State } from '../engine';
import { labelledBoard } from '../kit/board-labels';
import { drawBoard } from '../kit/board-svg';
import { controlButton, transport } from '../kit/controls';
import { PogoFigure } from '../kit/figure';
import { formatShare } from '../kit/score';
import { Stepper } from '../kit/stepper';
import { colon, t, type Lang } from '../kit/strings';
import type { SearchSnapshot } from '../mcts';
import type { AzNet } from '../nets';
import { sharedAz } from '../nets-shared';
import { store, type Store } from '../store';
import { formatCount } from './count-steps';
import { netPosition, positionWords } from './net-position';
import { barCell, colourName, el } from './net-view';
import netCss from './net.css?raw';
import searchCss from './pogo-search.css?raw';
import { signedNote } from './q-steps';
import { PUZZLE5, SEARCH_SIMS, STOPS, recordSearch, rowOrder, type SearchRun } from './search-steps';

export type SearchPosition = 'puzzle5' | 'reader';

export function parsePosition(attr: string | null): SearchPosition {
  if (attr === 'puzzle5' || attr === 'reader') return attr;
  throw new Error(`pogo-search: position must be puzzle5 or reader, not ${JSON.stringify(attr)}`);
}

/** The search on `s` with `net`, the parser and the search loaded on first use. */
/** The board's search, stated in full: AlphaZero's C_PUCT and the board's lc1-2 rules, never search()'s defaults. */
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
function withMoves(text: string): (string | HTMLElement)[] {
  return text
    .split(/([abc][123]-[123]-[abc][123])/)
    .filter((part) => part !== '')
    .map((part) => (/^[abc][123]-/.test(part) ? el('span', 'move-name', part) : part));
}

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
  static override fidelity = 'live' as const;
  static override game = 'gameLc12' as const;
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
    boardSlot.append(labelledBoard(drawBoard(s, { labelRoom: true, title: where })));

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

    const table = el('table', 'bars search-table');
    const caption = el('caption', 'label');
    table.append(caption);
    const head = el('tr');
    for (const [k, cls] of [
      ['netMove', 'move'],
      ['searchPrior', 'share'],
      ['searchVisits', 'visits'],
      ['searchMean', 'mean'],
    ] as const) {
      const th = el('th', `label ${cls}`, t(lang, k));
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    table.append(thead, body);

    const show = (snap: SearchSnapshot, final: boolean): void => {
      said.replaceChildren(...withMoves(snapshotWords(lang, snap, final)));
      caption.textContent = `${t(lang, 'searchMoves')} ${sims(lang, snap.sim)}`;
      const best = played(snap);
      body.replaceChildren(
        ...order.map((i) => {
          const r = snap.root[i]!;
          const tr = el('tr');
          tr.dataset.move = moveName(r.move);
          const th = el('th', 'move num');
          th.scope = 'row';
          th.append(moveName(r.move));
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
        }),
      );
    };
    show(before, false);

    const scale = el('p', 'note', `${t(lang, 'searchBars')} ${formatCount(lang, SEARCH_SIMS)}. ${t(lang, 'searchMeanWhat')} (${colourName(lang, s.to_move)}).`);

    // The controls: « Lancer » and « Jouer d'ici » until the search has run, then its steps.
    const controls = el('div', 'search-controls');
    const playFrom = (): void => this.playFrom(s, t(lang, 'searchLabel'));
    const launch = controlButton(t(lang, 'searchRun'), () => void start());
    launch.dataset.role = 'run';
    const fromHere = controlButton(t(lang, 'playFromHere'), playFrom, true);
    fromHere.dataset.role = 'play-from';
    const first = el('div', 'controls');
    first.append(launch, fromHere);
    controls.append(first);

    const start = async (): Promise<void> => {
      launch.disabled = true;
      launch.textContent = t(lang, 'searchRunning');
      let kept: SearchSnapshot[];
      try {
        kept = await recordSearch((o) => deps.search(s, net, o), signal);
      } catch (error) {
        if (signal.aborted) return;
        console.error('pogo-search: search failed', error);
        said.textContent = t(lang, 'searchStopped');
        launch.disabled = false;
        launch.textContent = t(lang, 'searchRun');
        return;
      }
      if (signal.aborted) return;
      const frames = [before, ...kept];
      const last = frames.length - 1;
      const stepper = new Stepper(frames.length, (i) => show(frames[i]!, i === last), { signal, interval: 1100 });
      const row = transport(stepper, {
        lang,
        counter: (i) => sims(lang, frames[i]!.sim),
        actions: [{ label: t(lang, 'playFromHere'), onClick: playFrom }],
      });
      controls.replaceChildren(row);
      stepper.go(1);
      // Under reduced motion `play` does nothing: the reader steps.
      stepper.play();
    };

    return [words, boardSlot, status, table, scale, controls, el('p', 'net-name', `${t(lang, 'netName')} ${NET_NAME} · ${sims(lang, SEARCH_SIMS)}.`)];
  }
}
