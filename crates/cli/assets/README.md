# Bundled network

`az-lc1-s1.pfw` — the final checkpoint (iteration 200) of AlphaZero seed 1 under
`lc1-2` (`docs/experiments/v2-results.md`), exported for the pure-Rust inference in
`pogofish-infer`. Seed 1 is the default seed, not chosen for its results.

Regenerate (needs the training run under `models/`):

```bash
./target/release/export_weights models/az-lc1-s1/checkpoints/iter_00200.pt crates/cli/assets/az-lc1-s1.pfw
```

The export refuses to write unless the copy matches the libtorch checkpoint within
1e-5 on 100 positions; for this file the largest difference was 8.6e-6.
