"""Produce evaluator-compatible artifacts using the API's extractor and crop policy."""
import argparse
import csv
import os
from pathlib import Path

import faiss
import numpy as np

from backend.data import embedding_batches, load_records
from backend.model import DEFAULT_WEIGHTS, DIMENSION, FeatureExtractor
from backend.retrieval import search_index


def generate(args):
    if not np.isfinite(args.threshold) or not -1 <= args.threshold <= 1:
        raise ValueError("threshold must be finite and between -1 and 1")
    if args.batch_size < 1:
        raise ValueError("batch-size must be positive")
    queries = load_records(args.images, args.query)
    gallery = load_records(args.images, args.gallery)
    if len(gallery) < 10:
        raise ValueError("At least 10 gallery images are required for an exact top-10 submission")
    extractor = FeatureExtractor(args.weights, args.device)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    # Memory-map the output; never retain all decoded images or an Nq x Ng similarity matrix.
    temporary = output / "embeddings.partial.npy"
    embeddings = np.lib.format.open_memmap(
        temporary, mode="w+", dtype=np.float32, shape=(len(queries) + len(gallery), DIMENSION)
    )
    index = faiss.IndexFlatIP(DIMENSION)
    for name, records, offset in (("query", queries, 0), ("gallery", gallery, len(queries))):
        for start, batch in embedding_batches(extractor, records, args.batch_size):
            embeddings[offset + start:offset + start + len(batch)] = batch
            if name == "gallery":
                index.add(batch)
            print(f"{name}: {start + len(batch)}/{len(records)}", flush=True)
    with (output / "submission.partial.csv").open("w", encoding="utf-8", newline="") as sub_file, \
         (output / "candidates.partial.csv").open("w", encoding="utf-8", newline="") as cand_file:
        submission, candidates = csv.writer(sub_file), csv.writer(cand_file)
        candidates.writerow(["query_id", "gallery_id", "confidence"])
        for start in range(0, len(queries), args.batch_size):
            results = search_index(index, embeddings[start:min(start + args.batch_size, len(queries))], 10)
            for offset, (scores, indices) in enumerate(results):
                query_id = queries[start + offset].image_id
                ids = [gallery[int(i)].image_id for i in indices]
                # Always rank every query, including refusals. Threshold is query-level.
                submission.writerow([query_id, *ids])
                if float(scores[0]) >= args.threshold:
                    candidates.writerows((query_id, gid, float(score)) for gid, score in zip(ids, scores))
    embeddings.flush()
    del embeddings
    temporary.replace(output / "embeddings.npy")
    for name in ("submission", "candidates"):
        (output / f"{name}.partial.csv").replace(output / f"{name}.csv")
    print(f"Artifacts saved to {output.resolve()}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", default=os.getenv("IMAGES_DIR", "images"))
    parser.add_argument("--query", default="test_query.csv")
    parser.add_argument("--gallery", default="test_gallery.csv")
    parser.add_argument("--weights", default=os.getenv("MODEL_WEIGHTS", str(DEFAULT_WEIGHTS)))
    parser.add_argument("--output", default="artifacts")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--threshold", type=float, default=0.72)
    parser.add_argument("--device", default=os.getenv("DEVICE", "auto"), choices=["auto", "cpu", "cuda"])
    args = parser.parse_args()
    try:
        generate(args)
    except (ValueError, FileNotFoundError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
