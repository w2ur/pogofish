"""Tests for MCTS tree search."""

import math
import torch
import pytest
import numpy as np

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move, is_terminal, reward,
)
from pogofish.dqn import move_to_action, action_to_move, ACTION_SIZE
from pogofish.mcts import MCTSNode, mcts_search, select_move, get_mcts_policy


def test_node_creation():
    """A new node has zero visits and no children."""
    state = initial_state()
    node = MCTSNode(state)
    assert node.visit_count == 0
    assert node.children == {}
    assert node.state == state


def test_node_is_leaf_before_expansion():
    """A node with no children is a leaf."""
    node = MCTSNode(initial_state())
    assert node.is_leaf()


def test_expand_creates_children_for_legal_moves():
    """Expansion creates one child per legal move with correct priors."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)

    # Uniform prior over legal moves
    prior = torch.zeros(ACTION_SIZE)
    for m in moves:
        prior[move_to_action(m)] = 1.0 / len(moves)

    node.expand(prior)

    assert not node.is_leaf()
    assert len(node.children) == len(moves)
    for m in moves:
        action = move_to_action(m)
        assert action in node.children
        child_info = node.children[action]
        assert child_info["prior"] == pytest.approx(1.0 / len(moves), abs=1e-6)
        assert child_info["visit_count"] == 0
        assert child_info["value_sum"] == 0.0


def test_puct_selects_high_prior_unvisited():
    """PUCT should prefer unvisited actions with high prior."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)

    prior = torch.zeros(ACTION_SIZE)
    # Give the first legal move a much higher prior
    actions = [move_to_action(m) for m in moves]
    prior[actions[0]] = 0.9
    for a in actions[1:]:
        prior[a] = 0.1 / (len(actions) - 1)

    node.expand(prior)
    node.visit_count = 1  # Parent has been visited once

    best_action = node.select_action(c_puct=1.5)
    assert best_action == actions[0]


def test_puct_formula_values():
    """Verify PUCT score computation matches the formula."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)
    actions = [move_to_action(m) for m in moves]

    prior = torch.zeros(ACTION_SIZE)
    for a in actions:
        prior[a] = 1.0 / len(actions)
    node.expand(prior)

    # Simulate: action 0 visited 5 times with value_sum = 2.0
    node.children[actions[0]]["visit_count"] = 5
    node.children[actions[0]]["value_sum"] = 2.0
    node.visit_count = 10

    c_puct = 1.5
    p = 1.0 / len(actions)

    # Q = 2.0 / 5 = 0.4
    # U = 1.5 * p * sqrt(10) / (1 + 5)
    expected_q = 0.4
    expected_u = c_puct * p * math.sqrt(10) / 6
    expected_puct = expected_q + expected_u

    score = node._puct_score(actions[0], c_puct)
    assert score == pytest.approx(expected_puct, abs=1e-6)


def test_backpropagate_negates_value():
    """Backpropagation negates value at each level (two-player)."""
    state = initial_state()
    root = MCTSNode(state)
    moves = legal_moves(state)
    actions = [move_to_action(m) for m in moves]

    prior = torch.zeros(ACTION_SIZE)
    for a in actions:
        prior[a] = 1.0 / len(actions)
    root.expand(prior)

    # Create a child
    child_state = apply_move(state, moves[0])
    child = MCTSNode(child_state, parent=root, parent_action=actions[0])
    root.children[actions[0]]["node"] = child

    # Backpropagate value +1.0 from child's perspective
    child.backpropagate(1.0)

    # Child gets +1.0
    assert child.visit_count == 1
    # Parent's edge value_sum gets -1.0 (negated)
    assert root.children[actions[0]]["value_sum"] == -1.0
    assert root.children[actions[0]]["visit_count"] == 1
    assert root.visit_count == 1


def test_backpropagate_three_levels():
    """Value alternates sign through three levels."""
    s0 = initial_state()
    root = MCTSNode(s0)
    m0 = legal_moves(s0)
    a0 = [move_to_action(m) for m in m0]

    prior = torch.zeros(ACTION_SIZE)
    for a in a0:
        prior[a] = 1.0 / len(a0)
    root.expand(prior)

    s1 = apply_move(s0, m0[0])
    child1 = MCTSNode(s1, parent=root, parent_action=a0[0])
    root.children[a0[0]]["node"] = child1

    m1 = legal_moves(s1)
    a1 = [move_to_action(m) for m in m1]
    prior1 = torch.zeros(ACTION_SIZE)
    for a in a1:
        prior1[a] = 1.0 / len(a1)
    child1.expand(prior1)

    s2 = apply_move(s1, m1[0])
    child2 = MCTSNode(s2, parent=child1, parent_action=a1[0])
    child1.children[a1[0]]["node"] = child2

    # Backprop +1.0 from child2
    child2.backpropagate(1.0)

    assert child2.visit_count == 1
    assert child1.children[a1[0]]["value_sum"] == -1.0  # negated once
    assert root.children[a0[0]]["value_sum"] == 1.0     # negated twice (back to +)


def test_add_dirichlet_noise():
    """Dirichlet noise modifies root priors while keeping them valid."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)
    actions = [move_to_action(m) for m in moves]

    prior = torch.zeros(ACTION_SIZE)
    for a in actions:
        prior[a] = 1.0 / len(actions)
    node.expand(prior)

    original_priors = {a: node.children[a]["prior"] for a in actions}
    node.add_dirichlet_noise(alpha=0.8, epsilon=0.25)

    # Priors should be modified
    changed = False
    for a in actions:
        if node.children[a]["prior"] != original_priors[a]:
            changed = True
        # Priors should still be non-negative
        assert node.children[a]["prior"] >= 0.0
    assert changed


def test_select_move_temperature_zero():
    """Temperature 0 selects the most-visited action."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)
    actions = [move_to_action(m) for m in moves]

    prior = torch.zeros(ACTION_SIZE)
    for a in actions:
        prior[a] = 1.0 / len(actions)
    node.expand(prior)

    # Give action[2] the most visits
    node.children[actions[2]]["visit_count"] = 100
    for a in actions:
        if a != actions[2]:
            node.children[a]["visit_count"] = 1

    action, policy = select_move(node, temperature=0.0)
    assert action == actions[2]
    # Policy should concentrate on the most-visited action
    assert policy[actions[2]] > 0.99


def test_select_move_temperature_one():
    """Temperature 1 samples proportional to visit counts."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)
    actions = [move_to_action(m) for m in moves]

    prior = torch.zeros(ACTION_SIZE)
    for a in actions:
        prior[a] = 1.0 / len(actions)
    node.expand(prior)

    # Give visit counts
    for i, a in enumerate(actions):
        node.children[a]["visit_count"] = (i + 1) * 10

    _, policy = select_move(node, temperature=1.0)
    total_visits = sum((i + 1) * 10 for i in range(len(actions)))
    for i, a in enumerate(actions):
        expected = (i + 1) * 10 / total_visits
        assert policy[a] == pytest.approx(expected, abs=1e-4)


def test_get_mcts_policy():
    """get_mcts_policy returns normalized visit count distribution."""
    state = initial_state()
    node = MCTSNode(state)
    moves = legal_moves(state)
    actions = [move_to_action(m) for m in moves]

    prior = torch.zeros(ACTION_SIZE)
    for a in actions:
        prior[a] = 1.0 / len(actions)
    node.expand(prior)

    node.children[actions[0]]["visit_count"] = 30
    node.children[actions[1]]["visit_count"] = 20
    for a in actions[2:]:
        node.children[a]["visit_count"] = 0

    policy = get_mcts_policy(node)
    assert policy.shape == (ACTION_SIZE,)
    assert policy.sum() == pytest.approx(1.0, abs=1e-5)
    assert policy[actions[0]] == pytest.approx(0.6, abs=1e-5)
    assert policy[actions[1]] == pytest.approx(0.4, abs=1e-5)


def test_mcts_search_basic():
    """mcts_search returns a valid action and policy for the initial state."""
    state = initial_state()
    moves = legal_moves(state)
    valid_actions = {move_to_action(m) for m in moves}

    def dummy_eval(s):
        ms = legal_moves(s)
        policy = torch.zeros(ACTION_SIZE)
        if ms:
            for m in ms:
                policy[move_to_action(m)] = 1.0 / len(ms)
        return policy, 0.0

    action, policy = mcts_search(
        state, dummy_eval, num_simulations=20,
        c_puct=1.5, temperature=1.0, dirichlet_alpha=0.8, dirichlet_epsilon=0.25,
    )
    assert action in valid_actions
    assert policy.shape == (ACTION_SIZE,)
    assert policy.sum() == pytest.approx(1.0, abs=1e-4)


def test_mcts_search_terminal_state():
    """mcts_search on a terminal state returns None action and zero policy."""
    # Construct a terminal state: all non-empty cells have W on top
    board = (("W",),) * 9
    state = GameState(board=board, current_player=W)
    assert is_terminal(state)

    def dummy_eval(s):
        return torch.zeros(ACTION_SIZE), 0.0

    action, policy = mcts_search(
        state, dummy_eval, num_simulations=10,
        c_puct=1.5, temperature=1.0,
    )
    assert action is None
    assert policy.sum() == 0.0
