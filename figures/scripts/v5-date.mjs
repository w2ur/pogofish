// The date the round-5 charts print: the commit date (UTC day) of
// docs/experiments/v5/curves.json, the file every packed score is read from.
// The bench JSONs carry no timestamp, so the commit that last wrote the scores
// is the closest date the repository records; the charts word it as the date
// the data stands at, never as the day a bench ran (they ran on 10 and 11
// November). Shared by pack-v5.mjs, which packs it, and the test that checks it.
import { execFileSync } from 'node:child_process';

export const CURVES = 'docs/experiments/v5/curves.json';

/** Thrown when git cannot answer: no repository, or a shallow clone whose dates are not the file's. */
export class DateCannotRun extends Error {}
/** Thrown when the answer would be false: curves.json differs from its last commit. */
export class DateFinding extends Error {}

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

/** 'YYYY-MM-DD' of curves.json's last commit, in UTC. `root` is the repository's root. */
export function curvesDate(root) {
  let shallow, dirty, stamp;
  try {
    shallow = git(root, ['rev-parse', '--is-shallow-repository']);
    dirty = git(root, ['status', '--porcelain', '--', CURVES]);
    stamp = git(root, ['log', '-1', '--format=%cI', '--', CURVES]);
  } catch (error) {
    throw new DateCannotRun(`git could not read ${CURVES}: ${error.message}`);
  }
  if (shallow !== 'false') throw new DateCannotRun(`shallow clone: the last commit seen is not ${CURVES}'s own`);
  if (dirty !== '') throw new DateFinding(`${CURVES} has uncommitted changes: its commit date is not its date`);
  if (stamp === '') throw new DateCannotRun(`${CURVES} has no commit`);
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) throw new DateCannotRun(`unreadable commit date ${stamp}`);
  return date.toISOString().slice(0, 10);
}
