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

## Main table

<!-- v4-table:start -->
<!-- v4-table:end -->

## Appendix: nets trained under lc1d-2

<!-- v4-appendix:start -->
<!-- v4-appendix:end -->
