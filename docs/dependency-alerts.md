# Dependency alerts (2026-11-10)

GitHub reported nine Dependabot alerts on 2026-11-10 (3 critical, 5 moderate, 1 low). The
Dependabot list itself was not readable from the session that handled them; the alerts were
reproduced locally with `npm audit` (`app/`) and `cargo audit` (workspace), which cover the
same advisory databases. Exposure is judged against the three things that ship: the static
site (`app/dist`, `app/dist-board`), the WASM engine (`wasm-pkg/`) and the CLI binary
(`pogofish-cli`, released by `release-cli.yml`).

## Fixed

| Package | Advisories | Reached through | Ships? | Fix |
|---|---|---|---|---|
| `tinypool`, `@vitest/mocker`, `vitest` | tinypool prototype-pollution RCE (critical, 2), mocker path traversal and code injection (moderate, 2) | `vitest` (dev) | no | `vitest` 3.2 → 4.1.12, which drops tinypool |
| `glob`, `minimatch` | GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249 (moderate) | `vite-plugin-pwa` → `workbox-build`, build time | no | `overrides`: `workbox-build` → `glob ^14.0.4` (pulls `minimatch` 11.0.6); precache manifest unchanged |
| `zstd-sys` | RUSTSEC-2026-0410 | `tch` → `zip` → `zstd` (`pogofish-train`) | no | 2.0.16 → 2.1.2 (lockfile) |

## Remaining, with reason

| Package | Advisories | Reason left open |
|---|---|---|
| `deepmerge` 4.3.1 | GHSA-gcqx-w48m-w2h4 (low) | No patched version exists (affects every release ≥ 4.2.0). Build-time only (`workbox-build` → `@rollup/plugin-node-resolve`), merges the repo's own config objects. |
| `zip` 0.6.6 | RUSTSEC-2026-0367, -0368, -0369, -0429 | Patched only in `zip` ≥ 9, which needs `tch` 0.27 (libtorch 2.12 instead of 2.4). That upgrade changes the training stack every result of rounds 2–4 was produced with. Used only by `pogofish-train` (`tch` reads `.npz`, `torch-sys`'s build script unpacks the libtorch archive); neither touches an untrusted archive, and the CLI does not depend on it (`cargo tree -p pogofish-cli`). |
| `zstd-safe` 5.0.2 | RUSTSEC-2026-0403 and eight "unsound" warnings | Same chain as `zip` (`zip` 0.6 → `zstd` 0.11 → `zstd-safe` 5); fixed by the same `tch` upgrade, same exposure. |

Revisit the last two when `tch` is next upgraded.
