import argparse
import csv
import io
from pathlib import Path

import faiss
from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest
import torch

from backend.data import crop_image, load_records
from backend.main import app
from backend.model import DEFAULT_WEIGHTS, FeatureExtractor
from backend.retrieval import search_index
from generate_submission import generate
import evaluate


@pytest.fixture
def dataset(tmp_path):
    images = tmp_path / "images"
    images.mkdir()
    rng = np.random.default_rng(42)
    rows = []
    for i in range(12):
        image_id = f"{i:04d}"
        data = rng.integers(0, 256, (80, 96, 3), dtype=np.uint8)
        data[10:70, 10:86] = [i * 20, 255 - i * 20, i * 10]
        Image.fromarray(data).save(images / f"{image_id}.png")
        rows.append([image_id, 10, 10, 76, 60])
    for name, selected in (("gallery", rows[:11]), ("query", [rows[0], rows[-1]])):
        with (tmp_path / f"{name}.csv").open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["image_id", "x", "y", "w", "h"])
            writer.writerows(selected)
    return tmp_path


def test_crop_and_id_resolution(dataset):
    records = load_records(dataset / "images", dataset / "query.csv")
    assert records[0].image_id == "0000"
    image = Image.new("RGB", (10, 10))
    assert crop_image(image, (-2, -1, 5, 6)).size == (3, 5)
    for bbox in ((0, 0, 0, 1), (20, 20, 1, 1), (float("nan"), 0, 1, 1)):
        with pytest.raises(ValueError):
            crop_image(image, bbox)


def test_faiss_ties_and_small_gallery():
    vectors = np.eye(512, dtype=np.float32)[:12]
    index = faiss.IndexFlatIP(512)
    index.add(vectors)
    scores, ids = search_index(index, vectors[:1], 10)[0]
    np.testing.assert_array_equal(ids, np.arange(10))
    assert scores[0] == 1
    assert len(search_index(index, vectors[:1], 100)[0][0]) == 12
    empty = faiss.IndexFlatIP(512)
    assert len(search_index(empty, vectors[:1], 10)[0][0]) == 0


def test_real_model_api_and_artifacts(dataset, monkeypatch):
    torch.set_num_threads(2)
    model = FeatureExtractor(DEFAULT_WEIGHTS, "cpu")
    with Image.open(dataset / "images/0000.png") as image:
        feature = model.extract_features(image)
    assert feature.shape == (1, 512) and feature.dtype == np.float32
    np.testing.assert_allclose(np.linalg.norm(feature, axis=1), 1, atol=1e-5)

    monkeypatch.setenv("IMAGES_DIR", str(dataset / "images"))
    monkeypatch.setenv("GALLERY_CSV", str(dataset / "gallery.csv"))
    monkeypatch.setenv("METADATA_CSV", "")
    monkeypatch.setenv("DEVICE", "cpu")
    with TestClient(app) as client:
        assert client.get("/api/v1/health").json() == {
            "status": "ok", "engine": "PyTorch + FAISS", "dimension": 512,
        }
        payload = (dataset / "images/0000.png").read_bytes()
        form = dict(x=10, y=10, w=76, h=60, top_k=100, threshold=-1)
        def post(data=form, content=payload):
            return client.post("/api/v1/search", data=data, files={"file": ("frame.png", content, "image/png")})
        result = post().json()
        assert result["status"] == "matched"
        assert len(result["candidates"]) == 11
        assert result["candidates"][0]["image_id"] == "0000"
        assert result["candidates"][0]["vehicle_id"] is None
        assert result["candidates"][0]["image_url"].startswith("data:image/jpeg;base64,")
        boundary = post({**form, "threshold": result["best_score"]}).json()
        assert boundary["status"] == "matched"
        different = (dataset / "images/0011.png").read_bytes()
        result = post(form, different).json()
        assert result["best_score"] < 1.0
        refusal = post({**form, "threshold": (1 + result["best_score"]) / 2}, different).json()
        assert refusal["status"] == "refusal" and refusal["candidates"] == []
        for bad in ({"w": 0}, {"x": 999}, {"top_k": 0}, {"threshold": "nan"}, {"threshold": 1.1}):
            assert post({**form, **bad}).status_code == 422
        assert post(content=b"not an image").status_code == 422
        assert post(content=b"x" * (20 * 1024 * 1024 + 1)).status_code == 413
        app.state.inference_slot.acquire()
        try:
            assert post().status_code == 503
        finally:
            app.state.inference_slot.release()

    output = dataset / "output"
    args = argparse.Namespace(images=dataset / "images", query=dataset / "query.csv",
                              gallery=dataset / "gallery.csv", weights=DEFAULT_WEIGHTS,
                              device="cpu", output=output, threshold=0.72, batch_size=2)
    generate(args)
    q_emb, g_emb, qids, gids = evaluate.load_embeddings(output / "embeddings.npy", args.query, args.gallery)
    raw = np.load(output / "embeddings.npy")
    assert raw.shape == (13, 512) and raw.dtype == np.float32
    np.testing.assert_allclose(np.linalg.norm(raw, axis=1), 1, atol=1e-5)
    ranked = evaluate.load_submission(output / "submission.csv", set(gids))
    accepted = evaluate.load_candidates(output / "candidates.csv")
    for i, qid in enumerate(qids):
        expected = np.argsort(-(q_emb[i] @ g_emb.T), kind="stable")[:10]
        assert ranked[qid] == [gids[j] for j in expected]
        if float(q_emb[i] @ g_emb[expected[0]]) >= args.threshold:
            assert len(accepted[qid]) == 10
        else:
            assert qid not in accepted
    # Re-run with a strict threshold to verify refusal rows are actually absent.
    args.threshold = 1.0
    generate(args)
    assert "0011" not in evaluate.load_candidates(output / "candidates.csv")
    assert len(evaluate.load_submission(output / "submission.csv", set(gids))) == 2
