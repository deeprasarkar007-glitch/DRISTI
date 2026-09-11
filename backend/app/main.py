"""
FastAPI backend for the dumper-truck webcam detector.

Run (from the backend/ folder, inside your virtual environment):

    uvicorn app.main:app --reload --port 8000

Endpoints:
    GET  /health    -> is the API up, and is the trained model loaded?
    POST /predict   -> send one webcam frame (multipart/form-data, field "frame"),
                       get back whether a dumper truck was detected.
"""

from __future__ import annotations

import io
import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from app.model_service import model_service
from app.schemas import HealthResponse, PredictionResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dumper_truck_backend")

app = FastAPI(
    title="Dumper Truck Detector API",
    description="Takes a webcam frame and reports whether a dumper truck is visible.",
    version="1.0.0",
)

# Fix: Added port 3002 and wildcard/flexible origin support for the frontend
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3003")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_origin, 
        "http://localhost:3000", 
        "http://127.0.0.1:3000", 
        "http://localhost:3002", 
        "http://127.0.0.1:3002",
        "http://localhost:3003", 
        "http://127.0.0.1:3003"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    return {
        "service": "dumper-truck-detector-api",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        model_loaded=model_service.is_loaded,
        class_names=model_service.class_names,
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict(frame: UploadFile = File(...)):
    if not model_service.is_loaded:
        raise HTTPException(
            status_code=503,
            detail=(
                "Model not loaded yet. Train it with the notebook in "
                "model_training/ and place the output files in backend/saved_model/."
            ),
        )

    raw_bytes = await frame.read()
    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.") from exc

    try:
        result = model_service.predict(image)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc

    return PredictionResponse(**result)

