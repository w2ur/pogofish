//! λ-returns, the TD(λ) training targets, kept here (pure over `f32`, no
//! libtorch) so that tools outside training can compute them; `pogofish-train`
//! re-exports [`lambda_returns`] from `td.rs`.

/// λ-returns G_0..G_{T−1} from `values` = V(s_0)..V(s_T), where V(s_T) is the
/// exact outcome for a terminated game or the net's estimate for a truncated
/// one. Each value is from its own player-to-move's side, hence the sign flip:
/// G_t = −[(1 − λ)·V(s_{t+1}) + λ·G_{t+1}], with G_T = V(s_T).
pub fn lambda_returns(values: &[f32], lambda: f32) -> Vec<f32> {
    let t_end = values.len() - 1;
    let mut g = vec![0.0; t_end];
    let mut next_g = values[t_end];
    for t in (0..t_end).rev() {
        g[t] = -((1.0 - lambda) * values[t + 1] + lambda * next_g);
        next_g = g[t];
    }
    g
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lambda_one_is_the_game_result_with_alternating_signs() {
        // Three moves, then the player to move at s_3 has lost (-1).
        let g = lambda_returns(&[0.3, -0.2, 0.9, -1.0], 1.0);
        assert_eq!(g, vec![1.0, -1.0, 1.0]);
    }

    #[test]
    fn lambda_zero_is_one_step_bootstrapping() {
        let g = lambda_returns(&[0.3, -0.2, 0.9, 0.4], 0.0);
        assert_eq!(g, vec![0.2, -0.9, -0.4]);
    }

    #[test]
    fn intermediate_lambda_mixes_both() {
        // G_1 = -(0.5·-1 + 0.5·-1) = 1 ; G_0 = -(0.5·0.5 + 0.5·1) = -0.75
        let g = lambda_returns(&[0.0, 0.5, -1.0], 0.5);
        assert_eq!(g, vec![-0.75, 1.0]);
    }

    #[test]
    fn a_game_over_at_the_start_has_no_targets() {
        assert!(lambda_returns(&[-1.0], 0.7).is_empty());
    }
}
