# Pogofish v4 — common evaluation of every player

Date: 2026-11-08

## Protocol

Filled in by Task 8.

## Table fingerprint

The reference table is the solved uncapped game of `v3-solve.md`. It was rebuilt from
scratch into a separate directory (`models/v4-solve/`) and compared with the original
(`models/v3-solve/table.bin`). The two files are byte-identical:

```
1690c767b68a6214eb1fb4d74d932198a13f67c744b7c6e61102eeb44c5e3704  table.bin
```

(SHA-256 of the full 466 MB file, `shasum -a 256`.) The rebuilt copy was then deleted;
the benches read `models/v3-solve`.

```bash
cargo build --release -p pogofish-search --bin retro
R=./target/release/retro; D=models/v4-solve
/usr/bin/time -l $R reach $D
/usr/bin/time -l $R solve $D
shasum -a 256 $D/table.bin models/v3-solve/table.bin
```

Measured on the 8 GB M2 Mac, 4 threads, uninterrupted:

| Step | Wall time | Peak resident memory |
|---|---|---|
| `retro reach` | 15.9 s | 90.5 MB |
| `retro solve` | 61.3 s | 474.8 MB |

## Pilot

`v4bench` on the bundled net, sample cut to 500 positions per class and 50 arena pairs
(the controls still run on the full 10,000 + 10,000 sample):

```bash
/usr/bin/time -l ./target/release/v4bench models/v3-solve net:crates/cli/assets/az-lc1-s1.pfw \
  --sample-cap 500 --pairs 50 --out pilot.json
```

Measured on the 8 GB M2 Mac, 4 threads: wall time 6.71 s; max RSS from `/usr/bin/time -l`
585 MB. Phases (the binary's own timings): table SHA-256 1.38 s, load 0.11 s, sample
0.67 s, controls 0.59 s, value kept on 1,000 positions 1.43 s, arena 2.27 s (50 pairs,
one thread).

Full run per net at 100 simulations (20,000 positions, 1,000 pairs), **extrapolated from
pilot**: 2.8 s fixed + 1.43 × 20 ≈ 29 s + 2.27 × 20 ≈ 45 s, about **77 s**, with max RSS
near 0.59 GB (the table dominates). The arena term is the noisy one: it rests on 50 pairs
whose game lengths vary with the opening, and a net that plays longer games takes longer.

## Main table

<!-- v4-table:start -->
<!-- v4-table:end -->

## Appendix: nets trained under lc1d-2

<!-- v4-appendix:start -->
<!-- v4-appendix:end -->
