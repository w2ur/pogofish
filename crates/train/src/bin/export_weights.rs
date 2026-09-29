//! Export a trained AlphaZero checkpoint for the pure-Rust inference used by
//! the terminal game (plan task 6.1). Refuses to write unless the copy
//! matches the checkpoint within 1e-5 on 100 positions.
//!
//! Usage: export_weights <checkpoint.pt> <out.pfw>

use anyhow::bail;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [checkpoint, out] = args.as_slice() else {
        bail!("usage: export_weights <checkpoint.pt> <out.pfw>");
    };
    let (mlp, worst) = pogofish_train::export::export(checkpoint.as_ref(), out.as_ref())?;
    eprintln!(
        "wrote {out}: {:?} features, {} trunk layers; largest difference from the checkpoint \
         on 100 positions: {worst:e}",
        mlp.features,
        mlp.trunk.len()
    );
    Ok(())
}
