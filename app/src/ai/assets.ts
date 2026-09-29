/**
 * Resolves a public asset (`ort/…`, `models/…`) under the build's base path.
 * The main SPA is served at `/`, the board-only build under `/pogofish/`, so a
 * hard-coded `/models/…` would 404 in the second. `base` is injectable so the
 * two cases can be tested in one process.
 */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, "");
}
