import base64
from contextlib import asynccontextmanager
import io
import logging
import os
from pathlib import Path
import threading
import time

import faiss
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from backend.data import crop_image, embedding_batches, load_crop, load_records
from backend.model import DEFAULT_WEIGHTS, DIMENSION, FeatureExtractor
from backend.retrieval import search_index

ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app):
    app.state.ready = False
    model = FeatureExtractor(os.getenv("MODEL_WEIGHTS", str(DEFAULT_WEIGHTS)), os.getenv("DEVICE", "auto"))
    records = load_records(
        os.getenv("IMAGES_DIR", str(ROOT / "images")),
        os.getenv("GALLERY_CSV", str(ROOT / "test_gallery.csv")) or None,
        os.getenv("METADATA_CSV", str(ROOT / "train.csv")) or None,
    )
    index = faiss.IndexFlatIP(DIMENSION)
    batch_size = int(os.getenv("BATCH_SIZE", "16"))
    for start, embeddings in embedding_batches(model, records, batch_size):
        index.add(embeddings)
        logger.info("Gallery: %d/%d", start + len(embeddings), len(records))
    app.state.model, app.state.records, app.state.index = model, records, index
    # Bound concurrent inference instead of accumulating GPU tensors or large previews.
    app.state.inference_slot = threading.BoundedSemaphore(1)
    app.state.ready = True
    try:
        yield
    finally:
        app.state.ready = False
        app.state.model = app.state.index = app.state.records = None


app = FastAPI(title="ФАЛЬКОН ReID API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")],
    allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["*"],
)


@app.get("/api/v1/health")
def health_check():
    if not getattr(app.state, "ready", False):
        raise HTTPException(503, "Gallery is not ready")
    return {"status": "ok", "engine": "PyTorch + FAISS", "dimension": DIMENSION}


def preview(record):
    with load_crop(record) as image:
        image.thumbnail((320, 240))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


@app.post("/api/v1/search")
def search(
    file: UploadFile = File(...),
    x: float = Form(..., allow_inf_nan=False),
    y: float = Form(..., allow_inf_nan=False),
    w: float = Form(..., gt=0, allow_inf_nan=False),
    h: float = Form(..., gt=0, allow_inf_nan=False),
    threshold: float = Form(0.72, ge=-1, le=1, allow_inf_nan=False),
    top_k: int = Form(10, ge=1, le=100),
):
    t0 = time.perf_counter()
    health_check()
    if not app.state.inference_slot.acquire(blocking=False):
        raise HTTPException(503, "Inference busy; retry shortly", headers={"Retry-After": "1"})
    try:
        contents = file.file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Image exceeds 20 MiB")
        try:
            with Image.open(io.BytesIO(contents)) as image:
                if image.format not in ("JPEG", "PNG"):
                    raise ValueError("Only JPEG and PNG are supported")
                if image.width * image.height > 25_000_000:
                    raise ValueError("Image exceeds 25 megapixels")
                with crop_image(image.convert("RGB"), (x, y, w, h)) as crop:
                    embedding = app.state.model.extract_features(crop)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(422, f"Invalid image or BBox: {exc}") from exc
        scores, indices = search_index(app.state.index, embedding, top_k)[0]
        best_score = float(scores[0]) if len(scores) else None
        matched = best_score is not None and best_score >= threshold
        candidates = []
        if matched:
            for rank, (score, idx) in enumerate(zip(scores, indices), start=1):
                record = app.state.records[int(idx)]
                candidates.append({
                    "rank": rank,
                    "image_id": record.image_id,
                    "vehicle_id": record.vehicle_id,
                    "camera_id": record.camera_id,
                    "score": float(score),
                    "image_url": preview(record),
                    "timestamp": None,
                    "heatmap_url": None,
                })
        return {
            "status": "matched" if matched else "refusal",
            "threshold": threshold, "best_score": best_score,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
            "candidates": candidates,
        }
    finally:
        file.file.close()
        app.state.inference_slot.release()
