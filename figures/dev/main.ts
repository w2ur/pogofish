// The harness: every kit surface on the page tokens, in both themes and
// languages. Later element tasks add their tags here.
import { configureAssets } from '../src/assets';
import { defineAll } from '../src/index';
import { initial, legal, moveName, play, ready, type Move, type State } from '../src/engine';
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
          drawBoard(states[i]!, {
            size: 320,
            labels: true,
            title: m ? moveName(m) : t(l, 'newGame'),
            ...(m ? { from: m.from_cell, to: m.to_cell, moving: m.num_pieces } : {}),
          }),
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

  app.append(heading('drawBoard · initial, mid-game, a move · 160px and 320px'));
  const after = play(initial(), legal(initial())[2]!);
  const boards = document.createElement('div');
  boards.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start';
  for (const size of [160, 320]) {
    boards.append(
      drawBoard(initial(), { size, labels: size === 320, title: t(l, 'newGame') }),
      drawBoard(MID, { size, labels: size === 320 }),
      drawBoard(after, { size, labels: size === 320, from: 0, to: 2, moving: 2 }),
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
