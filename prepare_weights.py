"""Download public ImageNet weights during preparation/build, never at inference."""
import argparse
from pathlib import Path

import torch
from torchvision.models import ResNet18_Weights

from backend.model import DEFAULT_WEIGHTS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_WEIGHTS)
    args = parser.parse_args()
    if args.output.is_file():
        print(f"Using existing weights: {args.output}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    state = ResNet18_Weights.IMAGENET1K_V1.get_state_dict(progress=True, check_hash=True)
    temporary = args.output.with_suffix(".tmp")
    torch.save(state, temporary)
    temporary.replace(args.output)
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
