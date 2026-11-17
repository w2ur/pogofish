// The harness: every kit surface on the page tokens, in both themes and
// languages. Later element tasks add their tags here.
import { configureAssets } from '../src/assets';
import { defineAll } from '../src/index';
import { initial, legal, moveName, play, ready, type Move, type State } from '../src/engine';
import { labelledBoard } from '../src/kit/board-labels';
import { drawBoard } from '../src/kit/board-svg';
import { controlButton, playFromAction, transport } from '../src/kit/controls';
import { PogoFigure, kitSheet, type PlayFromDetail } from '../src/kit/figure';
import { Stepper } from '../src/kit/stepper';
import { t, type Lang } from '../src/kit/strings';
import { ESSAY } from './essay';

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

function demo(): CustomElementConstructor {
  return class extends PogoFigure {
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
          playFromAction(l, () => this.playFrom(states[stepper.index]!, `demo-${stepper.index}`)),
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

customElements.define('kit-demo', demo());

async function build(): Promise<void> {
  await ready('/pogo/pogofish_wasm_bg.wasm');
  const l = lang();
  const app = document.getElementById('app')!;
  app.replaceChildren();

  app.append(heading('<pogo-title> · inside an h1, over the same h1 without the element (the box must match) · ?titleSize=72px overrides the size'));
  // The page's text: a <wbr> before the G and before the bangs. French sets a no-break space
  // before each « ! »; the one before the first stays with the camp, before the <wbr>.
  const parts = ['POOOOOO', l === 'fr' ? 'GOOOOOO\u00a0' : 'GOOOOOO', l === 'fr' ? '!' + '\u00a0!'.repeat(7) : '!'.repeat(8)];
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
  // In step with the clip beside it, as the page sets it (?free drops the clock).
  if (!new URLSearchParams(location.search).has('free')) {
    signature.setAttribute('clock', '.pogo-concert-clip');
    signature.setAttribute('beat', '0.4');
    signature.setAttribute('beat-at', '0.28');
  }
  fill(signature);
  h1.append(signature);
  const plain = document.createElement('h1');
  plain.className = 'pogo-title-demo';
  plain.id = 'title-plain';
  fill(plain);
  if (size) for (const h of [h1, plain]) h.style.fontSize = size;
  // Sized as the page sizes it: a camp fills the line of its container (hub, pogo.css).
  const head = document.createElement('div');
  head.className = 'pogo-title-head';
  head.append(h1, plain);
  // A 3 s looping clip whose square tops its bounce every 0.4 s, at 0.28 s (dev/beat-clip.mp4):
  // the pieces must top their jumps with it, freeze when it pauses, and re-phase when it loops.
  const clip = document.createElement('video');
  clip.className = 'pogo-concert-clip';
  clip.src = new URL('./beat-clip.mp4', import.meta.url).href;
  clip.loop = true;
  clip.muted = true;
  clip.autoplay = true;
  clip.playsInline = true;
  clip.controls = true;
  clip.width = 320;
  clip.height = 180;
  // Never wider than the column: at a 320px viewport the body's padding leaves 272px.
  clip.style.maxWidth = '100%';
  clip.style.height = 'auto';
  app.append(head, clip);

  app.append(heading('Type cuts'));
  app.append(
    kitBox(
      html(`<div class="shout" style="font-size:72px">Pogo 232 792 560</div>
        <p class="label" style="font-size:12.8px;margin:12px 0 0">${t(l, 'stagesPick')}</p>
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
  specimen.append(transport(new Stepper(8, () => {}), { lang: l, actions: [playFromAction(l, () => {})] }));
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

  // The essay's figures in page order, as the page sets them: the paragraph the reader has
  // just read, then the figure, then the author's caption (dev/essay.ts).
  // ?box=1100 lays the figures in a box that wide, as the page's .pogo-band does.
  const box = Number(new URLSearchParams(location.search).get('box')) || 640;
  app.append(heading(`The essay’s figures · each under its paragraph, its caption after it, in a ${box}px column`));
  const ids = new Map<string, number>();
  for (const f of ESSAY) {
    const words = f[l];
    const col = document.createElement('section');
    col.className = 'essay';
    col.style.maxWidth = `${box}px`;
    const para = document.createElement('p');
    para.className = 'essay-para';
    para.textContent = words.para;
    const fig = document.createElement('figure');
    fig.className = 'essay-figure';
    const el = document.createElement(f.tag);
    for (const [k, v] of Object.entries(f.attrs)) el.setAttribute(k, v);
    const fallback = document.createElement('p');
    fallback.textContent = words.fallback;
    el.append(fallback);
    // One id per figure: its tag and the attribute values that make it a variant, numbered when repeated.
    const base = [f.tag, ...Object.entries(f.attrs).filter(([k]) => k !== 'mode').map(([, v]) => v)].join('-');
    const n = (ids.get(base) ?? 0) + 1;
    ids.set(base, n);
    el.id = n > 1 ? `${base}-${n}` : base;
    if (f.tag === 'pogo-board') el.id = 'board-inline';
    fig.append(el);
    if (words.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = words.caption;
      fig.append(cap);
    }
    col.append(para, fig);
    app.append(col);
  }

  app.append(heading('Variants the essay does not use · <pogo-line rules="lc1-2">, <pogo-search position="reader">'));
  for (const [tag, attrs] of [
    ['pogo-line', { line: 'loop', rules: 'lc1-2' }],
    ['pogo-search', { position: 'reader' }],
  ] as const) {
    app.append(figure(tag, attrs, l === 'fr' ? 'Une variante.' : 'A variant.', '640px'));
  }

  app.append(
    heading('<pogo-board mode="follow"> · fixed to the bottom-right corner, as the page sets it: folded once a game is under way, hidden while the inline board is on screen'),
  );
  // A long column of text below, so the follow board covers text, as on the page.
  const column = document.createElement('div');
  column.id = 'follow-column';
  column.style.cssText = 'max-width:62ch;font-size:19px;line-height:1.55';
  const sentence =
    l === 'fr'
      ? 'Le Blanc joue le premier. Chaque pile peut sauter d’une, deux ou trois cases ; le haut de la pile la possède, et la partie se lit jusqu’au bout du texte. '
      : 'White moves first. Each stack may jump one, two or three cells; its top piece owns it, and the game reads to the end of the text. ';
  for (let k = 0; k < 24; k++) {
    const para = document.createElement('p');
    para.textContent = sentence.repeat(3);
    column.append(para);
  }
  app.append(column);
  const follow = document.createElement('pogo-board');
  follow.id = 'board-follow';
  follow.className = 'follow-demo';
  follow.setAttribute('mode', 'follow');
  app.append(follow);

  app.append(heading('PogoFigure + Stepper'));
  for (const tag of ['kit-demo']) {
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
