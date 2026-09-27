//! A small seeded generator (SplitMix64) so that scripted play and
//! measurements are reproducible from a single `u64` seed, with no
//! dependency.

#[derive(Debug, Clone)]
pub struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// The internal state; `SplitMix64::new(g.state())` continues exactly
    /// where `g` is, so a checkpoint can save and restore the generator.
    pub fn state(&self) -> u64 {
        self.state
    }

    /// Uniform float in [0, 1).
    pub fn unit_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform integer in `0..n`. `n` must be positive.
    pub fn below(&mut self, n: usize) -> usize {
        assert!(n > 0, "below(0)");
        // Lemire's multiply-shift; the bias for n < 2^32 is below 2^-32.
        (((self.next_u64() >> 32) * n as u64) >> 32) as usize
    }
}
