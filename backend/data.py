"""CSV loading, exact ID preservation, image resolution and shared crop policy."""
from dataclasses import dataclass
import math
from pathlib import Path

import pandas as pd
from PIL import Image

EXTENSIONS = {".jpg", ".jpeg", ".png"}


@dataclass(frozen=True)
class Record:
    image_id: str
    path: Path
    bbox: tuple[float, float, float, float] | None = None
    vehicle_id: str | None = None
    camera_id: str | None = None


def crop_image(image, bbox):
    if bbox is None:
        return image.copy()
    x, y, w, h = map(float, bbox)
    if not all(math.isfinite(v) for v in (x, y, w, h)) or w <= 0 or h <= 0:
        raise ValueError("BBox must contain finite coordinates and positive width/height")
    left, top = max(0, math.floor(x)), max(0, math.floor(y))
    right, bottom = min(image.width, math.ceil(x + w)), min(image.height, math.ceil(y + h))
    if right <= left or bottom <= top:
        raise ValueError("BBox does not intersect the image")
    return image.crop((left, top, right, bottom))


def load_crop(record):
    # Keep raw pixel coordinates: annotations refer to the original frame.
    with Image.open(record.path) as image:
        return crop_image(image.convert("RGB"), record.bbox)


def read_table(path):
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    if "image_id" not in df or df.empty:
        raise ValueError(f"{path}: expected nonempty image_id column")
    if (df.image_id.str.strip() == "").any() or df.image_id.duplicated().any():
        raise ValueError(f"{path}: blank or duplicate image_id")
    bbox_columns = {"x", "y", "w", "h"}
    if bbox_columns.intersection(df.columns) and not bbox_columns.issubset(df.columns):
        raise ValueError(f"{path}: provide all four BBox columns or none")
    return df


def load_records(images_dir, csv_path=None, metadata_csv=None):
    root = Path(images_dir).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Images directory not found: {root}")
    paths = sorted(p for p in root.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS)
    by_name = {p.name: p for p in paths}
    by_stem = {}
    for path in paths:
        by_stem.setdefault(path.stem, []).append(path)
    if csv_path:
        rows = read_table(csv_path).to_dict("records")
    else:
        rows = [{"image_id": p.name} for p in paths]
    if not rows:
        raise ValueError("Gallery is empty")
    metadata = {}
    if metadata_csv and Path(metadata_csv).is_file():
        metadata = {r["image_id"]: r for r in read_table(metadata_csv).to_dict("records")}
    records = []
    for row in rows:
        image_id = row["image_id"]
        path = by_name.get(image_id)
        if path is None:
            matches = by_stem.get(image_id, [])
            if len(matches) != 1:
                raise ValueError(f"Missing or ambiguous image_id: {image_id}")
            path = matches[0]
        if not path.resolve().is_relative_to(root):
            raise ValueError(f"Image escapes configured directory: {image_id}")
        extra = metadata.get(image_id, metadata.get(path.stem, {}))
        bbox_row = row if "x" in row else extra
        bbox = tuple(float(bbox_row[c]) for c in ("x", "y", "w", "h")) if "x" in bbox_row else None
        if bbox is not None and (not all(math.isfinite(v) for v in bbox) or min(bbox[2:]) <= 0):
            raise ValueError(f"Invalid BBox for {image_id}")
        records.append(Record(image_id, path, bbox,
                              row.get("vehicle_id") or extra.get("vehicle_id") or None,
                              row.get("camera_id") or extra.get("camera_id") or None))
    return records


def embedding_batches(extractor, records, batch_size):
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    for start in range(0, len(records), batch_size):
        images = []
        try:
            for record in records[start:start + batch_size]:
                images.append(load_crop(record))
            yield start, extractor.extract_batch(images)
        finally:
            for image in images:
                image.close()
