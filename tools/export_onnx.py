#!/usr/bin/env python3
"""
ONNX export sidecar for Pogofish AlphaZero models.

Mirrors the Rust AzNet architecture from crates/train/src/net.rs exactly,
loads a .pt checkpoint saved by tch-rs VarStore::save(), and exports to ONNX.

Usage:
    python tools/export_onnx.py <input.pt> <output.onnx> [--arch mlp_small]

The --arch flag selects the architecture to use:
    mlp_tiny:   trunk [128, 64], heads 64
    mlp_small:  trunk [256, 128], heads 128
    mlp_medium: trunk [512, 256, 128], heads 128
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn


STATE_SIZE = 109
ACTION_SIZE = 243


# Architecture configs matching crates/train/src/net.rs
ARCHITECTURES = {
    "mlp_tiny": {"trunk": [128, 64], "head": 64},
    "mlp_small": {"trunk": [256, 128], "head": 128},
    "mlp_medium": {"trunk": [512, 256, 128], "head": 128},
}


class AzNet(nn.Module):
    """Mirror of crates/train/src/net.rs AzNet.

    Layer names MUST match the Rust tch-rs paths exactly:
        trunk_0.weight, trunk_0.bias, trunk_1.weight, trunk_1.bias, ...
        policy_fc1.weight, policy_fc1.bias, policy_fc2.weight, policy_fc2.bias
        value_fc1.weight, value_fc1.bias, value_fc2.weight, value_fc2.bias
    """

    def __init__(self, trunk_sizes: list[int], head_size: int) -> None:
        super().__init__()

        # Build trunk as individual named layers (matching Rust naming)
        in_size = STATE_SIZE
        trunk_layers: list[nn.Module] = []
        for i, out_size in enumerate(trunk_sizes):
            linear = nn.Linear(in_size, out_size)
            self.add_module(f"trunk_{i}", linear)
            trunk_layers.append(linear)
            in_size = out_size
        self._trunk_layers = trunk_layers

        trunk_out = trunk_sizes[-1]

        # Policy head
        self.policy_fc1 = nn.Linear(trunk_out, head_size)
        self.policy_fc2 = nn.Linear(head_size, ACTION_SIZE)

        # Value head
        self.value_fc1 = nn.Linear(trunk_out, head_size)
        self.value_fc2 = nn.Linear(head_size, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = x
        for layer in self._trunk_layers:
            h = torch.relu(layer(h))

        policy = torch.relu(self.policy_fc1(h))
        policy = self.policy_fc2(policy)

        value = torch.relu(self.value_fc1(h))
        value = torch.tanh(self.value_fc2(value))

        return policy, value


def load_tch_checkpoint(model: AzNet, path: str) -> None:
    """Load a tch-rs VarStore checkpoint into the PyTorch model.

    tch-rs uses a format that PyTorch detects as TorchScript, so we
    need weights_only=False. These files are trusted (generated locally).
    """
    loaded = torch.load(path, map_location="cpu", weights_only=False)
    # tch-rs VarStore::save() may produce a ScriptModule or a raw state dict
    if hasattr(loaded, "state_dict"):
        state_dict = loaded.state_dict()
    elif isinstance(loaded, dict):
        state_dict = loaded
    else:
        state_dict = {name: param for name, param in loaded.named_parameters()}

    # tch-rs uses "|" as path separator (e.g., "trunk_0|weight"), while
    # PyTorch uses "." (e.g., "trunk_0.weight"). Remap.
    remapped = {k.replace("|", "."): v for k, v in state_dict.items()}
    model.load_state_dict(remapped)


def export_to_onnx(model: AzNet, output_path: str) -> None:
    """Export model to ONNX with dynamic batch axis."""
    model.eval()
    dummy = torch.randn(1, STATE_SIZE)
    torch.onnx.export(
        model,
        dummy,
        output_path,
        input_names=["state"],
        output_names=["policy", "value"],
        dynamic_axes={
            "state": {0: "batch"},
            "policy": {0: "batch"},
            "value": {0: "batch"},
        },
        opset_version=17,
        dynamo=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Pogofish AZ model to ONNX")
    parser.add_argument("input", help="Path to .pt checkpoint from tch-rs")
    parser.add_argument("output", help="Output .onnx path")
    parser.add_argument("--arch", default="mlp_small", choices=ARCHITECTURES.keys(),
                        help="Architecture name (default: mlp_small)")
    args = parser.parse_args()

    if not Path(args.input).exists():
        print(f"Error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    cfg = ARCHITECTURES[args.arch]
    print(f"Architecture: {args.arch} (trunk={cfg['trunk']}, head={cfg['head']})")

    model = AzNet(trunk_sizes=cfg["trunk"], head_size=cfg["head"])
    print(f"Loading checkpoint: {args.input}")
    load_tch_checkpoint(model, args.input)

    print(f"Exporting to ONNX: {args.output}")
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    export_to_onnx(model, args.output)

    size_kb = Path(args.output).stat().st_size / 1024
    print(f"Done. Output: {args.output} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
