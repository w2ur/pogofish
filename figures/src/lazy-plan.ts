// Which element modules to import, and when: the pure half of lazy definition
// (lazy-define.ts is the DOM half). A tag's module is requested at most once in
// the page's life: two instances share one import, and a failed import is never
// retried, so its instances keep their fallback without a loop of requests.

export type Phase = 'waiting' | 'loading' | 'defined' | 'failed';

export class LazyPlan {
  private readonly phases = new Map<string, Phase>();

  /** `defined` says which tags already have a class (defined by the page, or an earlier call). */
  constructor(tags: readonly string[], defined: (tag: string) => boolean = () => false) {
    for (const tag of tags) this.phases.set(tag, defined(tag) ? 'defined' : 'waiting');
  }

  /** Whether an instance of `tag` still needs watching: a known tag whose module was never requested. */
  waiting(tag: string): boolean {
    return this.phases.get(tag) === 'waiting';
  }

  /** Whether any tag is still waiting; once none is, there is nothing left to watch for. */
  anyWaiting(): boolean {
    for (const p of this.phases.values()) if (p === 'waiting') return true;
    return false;
  }

  phase(tag: string): Phase | undefined {
    return this.phases.get(tag);
  }

  /** The tags among `approached` to import now, each once; they move to `loading`. Unknown tags are ignored. */
  take(approached: Iterable<string>): string[] {
    const out: string[] = [];
    for (const tag of approached) {
      if (this.phases.get(tag) !== 'waiting') continue;
      this.phases.set(tag, 'loading');
      out.push(tag);
    }
    return out;
  }

  /** Records an import's outcome. Neither outcome makes the tag waiting again. */
  settle(tag: string, ok: boolean): void {
    if (this.phases.get(tag) === 'loading') this.phases.set(tag, ok ? 'defined' : 'failed');
  }
}
