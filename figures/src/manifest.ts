/** Names of the custom elements this package registers, as a type: `registry.ts` must load each one. */
export const TAGS = [
  'pogo-board',
  'pogo-title',
  'pogo-moves',
  'pogo-line',
  'pogo-count',
  'pogo-reach',
  'pogo-retrograde',
  'pogo-openings',
  'pogo-greedy',
  'pogo-qsteps',
  'pogo-stages',
  'pogo-race',
  'pogo-mosaic',
  'pogo-net',
  'pogo-encoding',
  'pogo-td-targets',
  'pogo-search',
] as const;

export type Tag = (typeof TAGS)[number];

/** Names of the custom elements this package registers. */
export const manifest: string[] = [...TAGS];
