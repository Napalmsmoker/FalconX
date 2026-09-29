"""Shared, offline-capable 512-dimensional image feature extractor."""
from pathlib import Path
from threading import Lock

import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.nn import functional as F
from torchvision import models, transforms

DIMENSION = 512
DEFAULT_WEIGHTS = Path(__file__).resolve().parents[1] / "weights" / "resnet18.pth"


class FeatureExtractor:
    def __init__(self, weights_path=DEFAULT_WEIGHTS, device="auto"):
        self.device = torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        ) if device == "auto" else torch.device(device)
        path = Path(weights_path)
        if not path.is_file():
            raise FileNotFoundError(
                f"Missing weights: {path}. Run python prepare_weights.py before offline inference."
            )
        # ResNet18's pooled backbone features are already 512-dimensional.
        # No untrained projection and no classifier logits are used.
        self.model = models.resnet18(weights=None)
        state = torch.load(path, map_location="cpu", weights_only=True)
        self.model.load_state_dict(state, strict=True)
        self.model.fc = nn.Identity()
        self.model.eval().to(self.device)
        self.transform = transforms.Compose([
            transforms.Resize((256, 256), antialias=True),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        self.lock = Lock()

    def extract_batch(self, images: list[Image.Image]) -> np.ndarray:
        if not images:
            return np.empty((0, DIMENSION), dtype=np.float32)
        with self.lock, torch.inference_mode():
            batch = torch.stack([self.transform(im.convert("RGB")) for im in images])
            features = self.model(batch.to(self.device))
            features = F.normalize(features.float(), p=2, dim=1)
            result = features.cpu().numpy()
        if not np.isfinite(result).all() or not np.allclose(
            np.linalg.norm(result, axis=1), 1.0, atol=1e-5
        ):
            raise RuntimeError("Model produced non-finite or non-unit embeddings")
        return np.ascontiguousarray(result, dtype=np.float32)

    def extract_features(self, image: Image.Image) -> np.ndarray:
        """Return shape (1, 512), ready for IndexFlatIP.search."""
        return self.extract_batch([image])
