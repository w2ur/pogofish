// One figure in export mode (src/kit/export.ts), for a capture script: see export.html.
// When it is drawn, `window.pogoExport` holds the figure; a failed render sets
// `window.pogoExportError`.
import { configureAssets } from '../src/assets';
import { loadAll } from '../src/index';
import type { PogoFigure } from '../src/kit/figure';

declare global {
  interface Window {
    pogoExport?: PogoFigure;
    pogoExportError?: string;
  }
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const tag = q.get('tag');
  if (!tag) throw new Error('export.html needs ?tag=');
  const attrs = JSON.parse(q.get('attrs') ?? '{}') as Record<string, string>;
  document.documentElement.lang = q.get('lang') ?? 'fr';
  const shot = document.getElementById('shot')!;
  shot.style.setProperty('--width', `${Number(q.get('width') ?? 672)}px`);
  shot.style.setProperty('--pad', `${Number(q.get('pad') ?? 24)}px`);

  configureAssets({ base: '/pogo/', worker: '/pogo/src/search.worker.ts' });
  await loadAll();
  await document.fonts.ready;
  const el = document.createElement(tag) as PogoFigure;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute('export', '');
  shot.append(el);
  await el.whenRendered();
  if (el.hasAttribute('data-failed')) throw new Error(`${tag}: render failed`);
  window.pogoExport = el;
}

main().catch((error: unknown) => {
  window.pogoExportError = String(error instanceof Error ? error.message : error);
});
