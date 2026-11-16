// The harness: every kit surface on the page tokens, in both themes and
// languages. Later element tasks add their tags here.
import { configureAssets } from '../src/assets';
import { defineAll } from '../src/index';
import { initial, legal, moveName, play, ready, type Move, type State } from '../src/engine';
import { labelledBoard } from '../src/kit/board-labels';
import { drawBoard } from '../src/kit/board-svg';
import { controlButton, transport } from '../src/kit/controls';
import { PogoFigure, kitSheet, type PlayFromDetail } from '../src/kit/figure';
import { Stepper } from '../src/kit/stepper';
import { t, type Fidelity, type Lang } from '../src/kit/strings';

const lang = (): Lang => (document.documentElement.lang.startsWith('fr') ? 'fr' : 'en');

/** A box drawn by the kit's own stylesheet, as a figure's shadow root is. */
function kitBox(...children: Node[]): HTMLElement {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.adoptedStyleSheets = [kitSheet()];
  root.append(...children);
  return host;
}

function html(markup: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

/** A figure element with its fallback sentence, as the page writes it. */
function figure(tag: string, attrs: Record<string, string>, fallback: string, maxWidth = ''): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const p = document.createElement('p');
  p.textContent = fallback;
  el.append(p);
  el.id = [tag, ...Object.values(attrs)].join('-');
  if (maxWidth) el.style.maxWidth = maxWidth;
  el.style.marginBottom = '32px';
  return el;
}

function heading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

const MID: State = {
  cells: [['White'], [], ['Red', 'White'], ['Red', 'Red'], ['White', 'White', 'Red'], [], ['Red'], [], ['White', 'Red', 'White']],
  to_move: 'Red',
  move_count: 9,
  history: [],
};

/** A short game: the first legal move each ply, so the harness is deterministic. */
function game(plies: number): { states: State[]; moves: Move[] } {
  const states = [initial()];
  const moves: Move[] = [];
  for (let i = 0; i < plies; i++) {
    const m = legal(states[i]!)[i % 3]!;
    moves.push(m);
    states.push(play(states[i]!, m));
  }
  return { states, moves };
}

function demo(kind: Fidelity, source?: string): CustomElementConstructor {
  return class extends PogoFigure {
    static override fidelity = kind;
    static override source = source;
    static override stageMinHeight = '400px';

    protected async render(): Promise<void> {
      await ready('/pogo/pogofish_wasm_bg.wasm');
      const l = this.lang;
      const { states, moves } = game(8);
      const boardSlot = document.createElement('div');
      const show = (i: number): void => {
        const m = moves[i - 1];
        boardSlot.replaceChildren(
          labelledBoard(
            drawBoard(states[i]!, {
              size: 320,
              labelRoom: true,
              title: m ? moveName(m) : t(l, 'newGame'),
              ...(m ? { from: m.from_cell, to: m.to_cell, moving: m.num_pieces } : {}),
            }),
          ),
        );
      };
      const stepper = new Stepper(states.length, show, { signal: this.signal });
      const controls = transport(stepper, {
        lang: l,
        counter: (i, n) => `${i} / ${n - 1}`,
        actions: [
          { label: t(l, 'restart'), onClick: () => stepper.go(0) },
          {
            label: t(l, 'playFromHere'),
            onClick: () => this.playFrom(states[stepper.index]!, `demo-${stepper.index}`),
            primary: true,
          },
        ],
      });
      show(0);
      this.stage.append(boardSlot, controls);
    }
  };
}

// The dev server serves the binaries from public/ at /pogo/ and the worker from
// its source; ?worker=broken points it at a missing file, to see the fallback.
configureAssets({
  base: '/pogo/',
  worker: new URLSearchParams(location.search).get('worker') === 'broken' ? '/pogo/no-such-worker.js' : '/pogo/src/search.worker.ts',
});
defineAll();

customElements.define('kit-demo-live', demo('live'));
customElements.define('kit-demo-measured', demo('measured', 'data/table.json'));
customElements.define('kit-demo-illustrative', demo('illustrative'));

async function build(): Promise<void> {
  await ready('/pogo/pogofish_wasm_bg.wasm');
  const l = lang();
  const app = document.getElementById('app')!;
  app.replaceChildren();

  app.append(heading('<pogo-title> · inside an h1, over the same h1 without the element (the box must match) · ?titleSize=72px overrides the size'));
  // The page's text: a <wbr> before the G and before the bangs; French glues each « ! » with U+202F.
  const parts = ['POOOOOO', 'GOOOOOO', l === 'fr' ? '\u202f!'.repeat(8) : '!'.repeat(8)];
  const fill = (target: HTMLElement): void => {
    parts.forEach((part, k) => {
      if (k > 0) target.append(document.createElement('wbr'));
      target.append(part);
    });
  };
  const size = new URLSearchParams(location.search).get('titleSize');
  const h1 = document.createElement('h1');
  h1.className = 'pogo-title-demo';
  h1.id = 'title-upgraded';
  const signature = document.createElement('pogo-title');
  fill(signature);
  h1.append(signature);
  const plain = document.createElement('h1');
  plain.className = 'pogo-title-demo';
  plain.id = 'title-plain';
  fill(plain);
  if (size) for (const h of [h1, plain]) h.style.fontSize = size;
  app.append(h1, plain);

  app.append(heading('Type cuts'));
  app.append(
    kitBox(
      html(`<div class="shout" style="font-size:72px">Pogo 232 792 560</div>
        <p class="label" style="font-size:12.8px;margin:12px 0 0">${t(l, 'fidelityLive')} · ${t(l, 'gameLc12')}</p>
        <p style="font-size:19px;max-width:62ch;margin:8px 0 0">${
          l === 'fr'
            ? 'Le Blanc joue le premier. Chaque pile peut sauter d’une, deux ou trois cases ; le haut de la pile la possède.'
            : 'White moves first. Each stack may jump one, two or three cells; its top piece owns it.'
        }</p>`),
    ),
  );

  app.append(heading('Controls · primary, secondary, icon · default, hover, pressed, focus, disabled'));
  const specimen = document.createElement('div');
  specimen.style.cssText = 'display:grid;gap:12px';
  const STATES = ['default', 'hover', 'pressed', 'focus', 'disabled'] as const;
  for (const style of ['primary', 'secondary', 'icon'] as const) {
    const row = document.createElement('div');
    row.className = 'controls';
    for (const state of STATES) {
      let b: HTMLButtonElement;
      if (style === 'icon') {
        // An icon button is the transport's own: take one from a throwaway row.
        const r = transport(new Stepper(3, () => {}), { lang: l });
        b = r.querySelector<HTMLButtonElement>('[data-role="next"]')!;
      } else {
        b = controlButton(t(l, style === 'primary' ? 'play' : 'restart'), () => {}, style === 'secondary');
      }
      b.disabled = state === 'disabled';
      b.dataset.demo = state;
      row.append(b);
    }
    specimen.append(row);
  }
  specimen.append(transport(new Stepper(8, () => {}), { lang: l, actions: [{ label: t(l, 'playFromHere'), onClick: () => {} }] }));
  app.append(kitBox(specimen));

  app.append(heading('drawBoard · initial, mid-game, a move · 160px bare, 240px and 400px with labelledBoard (labels stay 12.8px)'));
  const after = play(initial(), legal(initial())[2]!);
  const boards = document.createElement('div');
  boards.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start';
  for (const size of [160, 240, 400]) {
    // Labels need a board of 240px or more (board-labels.ts).
    const labelRoom = size >= 240;
    const wrap = (svg: SVGSVGElement): Element => (labelRoom ? labelledBoard(svg) : svg);
    boards.append(
      wrap(drawBoard(initial(), { size, labelRoom, title: t(l, 'newGame') })),
      wrap(drawBoard(MID, { size, labelRoom })),
      wrap(drawBoard(after, { size, labelRoom, from: 0, to: 2, moving: 2 })),
    );
  }
  app.append(kitBox(boards));

  app.append(heading('<pogo-board> · inline'));
  const board = document.createElement('pogo-board');
  board.id = 'board-inline';
  board.innerHTML = `<p>${l === 'fr' ? 'Sans JavaScript, le plateau ne se joue pas.' : 'Without JavaScript, the board cannot be played.'}</p>`;
  board.style.maxWidth = '640px';
  app.append(board);

  app.append(heading('<pogo-board mode="follow"> · appears once a game is under way'));
  const follow = document.createElement('pogo-board');
  follow.id = 'board-follow';
  follow.setAttribute('mode', 'follow');
  follow.style.maxWidth = '320px';
  app.append(follow);

  app.append(heading('<pogo-moves view="start"> · 640px stage'));
  app.append(figure('pogo-moves', { view: 'start' }, l === 'fr' ? 'Le plateau de trois cases sur trois au départ.' : 'The three-by-three board at the start.', '640px'));
  app.append(heading('<pogo-moves view="moves"> · 640px stage'));
  app.append(figure('pogo-moves', { view: 'moves' }, l === 'fr' ? 'Les coups possibles depuis une pile.' : 'The possible moves from a stack.', '640px'));

  for (const [line, rules] of [
    ['shortestWin', 'A'],
    ['loop', 'A'],
    ['loop', 'lc1-2'],
    ['centreLoss', 'A'],
    ['openingWin', 'A'],
  ] as const) {
    app.append(heading(`<pogo-line line="${line}" rules="${rules}"> · 52ch column`));
    app.append(figure('pogo-line', { line, rules }, l === 'fr' ? 'Une partie, coup par coup.' : 'A game, move by move.', '52ch'));
  }

  app.append(heading('<pogo-count> · full band'));
  app.append(figure('pogo-count', {}, l === 'fr' ? 'Le décompte des positions du Pogo, étape par étape.' : 'The count of Pogo positions, step by step.'));

  app.append(heading('<pogo-reach> · 52ch column'));
  app.append(
    figure(
      'pogo-reach',
      {},
      l === 'fr'
        ? 'L’exploration en largeur, niveau par niveau : les positions nouvelles atteintes à chaque coup, jusqu’au quinzième.'
        : 'The breadth-first exploration, level by level: the new positions reached at each move, up to the fifteenth.',
      '52ch',
    ),
  );

  app.append(heading('<pogo-retrograde> · 640px stage'));
  app.append(
    figure(
      'pogo-retrograde',
      {},
      l === 'fr'
        ? 'L’analyse rétrograde : en partant des fins de partie, les positions sont marquées gagnées ou perdues, tour après tour, en remontant vers le départ.'
        : 'Retrograde analysis: starting from the ends of games, positions are marked won or lost, round after round, climbing back towards the start.',
      '640px',
    ),
  );

  app.append(heading('<pogo-openings> · 640px stage'));
  app.append(
    figure(
      'pogo-openings',
      {},
      l === 'fr'
        ? 'Les seize premiers coups possibles et leur issue : seuls les six qui restent sur la rangée de départ évitent la défaite.'
        : 'The sixteen possible first moves and their outcome: only the six that stay on the starting row avoid defeat.',
      '640px',
    ),
  );

  app.append(heading('<pogo-greedy> · 52ch column'));
  app.append(
    figure(
      'pogo-greedy',
      {},
      l === 'fr'
        ? 'Une partie entre deux programmes gloutons, chacun choisissant le coup qui maximise l’écart entre son nombre de piles et celui de son adversaire.'
        : 'A game between two greedy programs, each choosing the move that maximises the gap between its number of stacks and its opponent’s.',
      '52ch',
    ),
  );

  app.append(heading('<pogo-qsteps> · 640px stage'));
  app.append(
    figure(
      'pogo-qsteps',
      {},
      l === 'fr'
        ? 'Le Q-learning pas à pas : les notes des positions, toutes à 0 au départ, mises à jour coup après coup.'
        : 'Q-learning step by step: the values of the positions, all 0 at the start, updated move after move.',
      '640px',
    ),
  );

  for (const [program, fr, en] of [
    ['qtab', 'Des parties du Q-learning à plusieurs étapes de son apprentissage.', 'Games of the Q-learning program at several stages of its training.'],
    ['td', 'Des parties du programme TD(λ) à plusieurs étapes de son apprentissage.', 'Games of the TD(λ) program at several stages of its training.'],
    ['az100', 'Des parties d’AlphaZero à plusieurs étapes de son apprentissage.', 'Games of AlphaZero at several stages of its training.'],
  ] as const) {
    app.append(heading(`<pogo-stages program="${program}"> · 640px stage`));
    app.append(figure('pogo-stages', { program }, l === 'fr' ? fr : en, '640px'));
  }

  app.append(heading('<pogo-net kind="td"> · 640px stage'));
  app.append(
    figure(
      'pogo-net',
      { kind: 'td' },
      l === 'fr'
        ? 'Un réseau de neurones : une position à gauche, ses 127 valeurs d’entrée, deux couches de 128 et 64 neurones, et un neurone de sortie qui donne la note de la position.'
        : 'A neural network: a position on the left, its 127 input values, two layers of 128 and 64 neurons, and an output neuron that gives the position’s value.',
      '640px',
    ),
  );

  app.append(heading('<pogo-encoding> · 640px stage'));
  app.append(
    figure(
      'pogo-encoding',
      {},
      l === 'fr'
        ? 'La même position traduite en 127 nombres : 14 pour chacune des neuf cases, puis le nombre de répétitions de la position.'
        : 'The same position as 127 numbers: 14 for each of the nine cells, then the number of repetitions of the position.',
      '640px',
    ),
  );

  app.append(heading('<pogo-net kind="az"> · 640px stage'));
  app.append(
    figure(
      'pogo-net',
      { kind: 'az' },
      l === 'fr'
        ? 'Le réseau d’AlphaZero et ses deux sorties : une note de la position et une préférence pour chaque coup.'
        : 'AlphaZero’s network and its two outputs: a value for the position and a preference for each move.',
      '640px',
    ),
  );

  app.append(heading('<pogo-race> · 640px stage'));
  const race = figure(
    'pogo-race',
    {},
    l === 'fr'
      ? 'Le nombre de parties d’entrainement qu’il faut à chaque programme pour dépasser le glouton.'
      : 'The number of training games each program needs to pass greedy.',
    '640px',
  );
  const video = document.createElement('p');
  video.textContent = 'https://youtu.be/ARDa8YljkWE';
  race.append(video);
  app.append(race);

  app.append(heading('<pogo-mosaic> · 640px stage'));
  app.append(
    figure(
      'pogo-mosaic',
      {},
      l === 'fr'
        ? 'Des mosaïques qui montrent, pour chaque programme, l’évolution de ses résultats au fil de l’entrainement.'
        : 'Mosaics that show, for each program, how its results change over training.',
      '640px',
    ),
  );

  app.append(heading('PogoFigure + Stepper · one per fidelity'));
  for (const tag of ['kit-demo-live', 'kit-demo-measured', 'kit-demo-illustrative']) {
    const el = document.createElement(tag);
    el.innerHTML = `<p>${l === 'fr' ? 'Sans JavaScript, cette phrase remplace la figure.' : 'Without JavaScript, this sentence stands in for the figure.'}</p>`;
    el.style.marginBottom = '32px';
    app.append(el);
  }
}

document.getElementById('theme')!.addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
});
document.getElementById('lang')!.addEventListener('click', () => {
  const root = document.documentElement;
  root.lang = root.lang === 'fr' ? 'en' : 'fr';
  void build();
});
document.addEventListener('pogo:playfrom', (e) => {
  const { label, state } = (e as CustomEvent<PlayFromDetail>).detail;
  document.getElementById('played')!.textContent = `pogo:playfrom ${label} · ${state.to_move}`;
});

void build();
