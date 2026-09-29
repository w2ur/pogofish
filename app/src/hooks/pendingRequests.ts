export type PendingMap = Map<number, { reject: (err: Error) => void }>;

/** Rejects and clears every pending request (a worker that died cannot answer them). */
export function rejectAllPending(pending: PendingMap, err: Error): void {
  const entries = [...pending.values()];
  pending.clear();
  for (const p of entries) p.reject(err);
}
