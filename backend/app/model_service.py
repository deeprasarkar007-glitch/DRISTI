"""
Loads the trained dumper-truck detector and runs inference on single frames.

Two detection modes are supported, auto-selected based on which files exist in
backend/saved_model/ (produced by
model_training/train_dumper_truck_classifier.ipynb):

Similarity mode (used when you only have positive "dumper_truck" photos, no
matched "no_dumper_truck" set) — compares each incoming frame against a bank
of reference embeddings computed from your photos, and reports a match if
it's similar enough to enough of them. Nothing is trained/fitted here (the
feature extractor is a frozen, pretrained MobileNetV2), which avoids a
classifier learning to key off some shortcut in your photos (e.g. "this came
from my webcam") instead of the truck itself. Needs:
    saved_model/prototype_embeddings.npy
    saved_model/threshold.json

Classifier mode (used when you trained with both dumper_truck/ and
no_dumper_truck/ folders sourced the same way) — a binary classifier that was
actually trained to tell the two apart. Needs:
    saved_model/dumper_truck_model.keras (or .h5)
    saved_model/class_names.json

Similarity mode is checked first; if both sets of files happen to be present,
similarity mode wins. Either way this module exposes the same predict() shape
so the rest of the backend (and the frontend) don't need to know which mode
is active.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("dumper_truck_backend")

IMG_SIZE = (224, 224)  # must match the size used in the training notebook
POSITIVE_LABEL = "dumper_truck"
NEGATIVE_LABEL = "no_dumper_truck"

DEFAULT_TOP_K = 5

# Fog/haze mitigation applied to every incoming frame before it's compared
# against the model (independent of the synthetic fog variants baked into the
# reference bank at training time — this helps either way). Set
# ENHANCE_VISIBILITY=false in the environment to disable it, e.g. to A/B
# compare behaviour with and without it. Must match the notebook's
# ENHANCE_VISIBILITY setting, or reference embeddings and live frames won't
# be preprocessed the same way.
ENHANCE_VISIBILITY = os.getenv("ENHANCE_VISIBILITY", "true").strip().lower() not in (
    "false",
    "0",
    "no",
)


def enhance_visibility(image: Image.Image) -> Image.Image:
    """Lightweight haze/fog mitigation via CLAHE (Contrast Limited Adaptive
    Histogram Equalization) on the lightness channel in LAB color space.

    Fog and haze mainly wash out *contrast*, not color, so boosting local
    contrast on the L channel (and leaving the a/b color channels alone)
    tends to recover a lot of visible detail in a hazy frame without
    introducing color artifacts the way equalizing all three RGB channels
    directly would. This is a classic, cheap dehazing approximation — not as
    thorough as a full dark-channel-prior dehaze, but fast enough to run on
    every incoming webcam frame in real time.
    """
    array = np.array(image.convert("RGB"))
    lab = cv2.cvtColor(array, cv2.COLOR_RGB2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_channel)

    enhanced_lab = cv2.merge((l_enhanced, a_channel, b_channel))
    enhanced_rgb = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2RGB)
    return Image.fromarray(enhanced_rgb)


def _default_model_dir() -> Path:
    # backend/app/model_service.py -> backend/saved_model
    return Path(__file__).resolve().parent.parent / "saved_model"


class DumperTruckModel:
    def __init__(self, model_dir: str | Path | None = None):
        self.model_dir = Path(model_dir) if model_dir else _default_model_dir()
        self.mode: str | None = None  # "similarity" | "classifier" | None

        # similarity-mode state
        self.embeddings: np.ndarray | None = None
        self.similarity_threshold: float | None = None
        self.top_k: int = DEFAULT_TOP_K
        self.feature_extractor = None

        # classifier-mode state
        self.model = None
        self.class_names: list[str] | None = None

        self._load()

    @property
    def is_loaded(self) -> bool:
        return self.mode is not None

    def _load(self) -> None:
        if self._try_load_similarity_mode():
            return
        if self._try_load_classifier_mode():
            return
        if self._try_load_demo_mode():
            return
        logger.warning(
            "No trained model found in %s. /predict will return 503 until you "
            "run the training notebook and its output files end up there.",
            self.model_dir,
        )

    def _try_load_demo_mode(self) -> bool:
        demo_env = os.getenv("DEMO_MODE", "true").strip().lower()
        if demo_env in ("true", "1", "yes"):
            self.mode = "demo"
            self.similarity_threshold = 0.50
            logger.info("Demo mode active: real-time webcam frame analysis enabled without requiring local weights.")
            return True
        return False

    def _try_load_similarity_mode(self) -> bool:
        embeddings_path = self.model_dir / "prototype_embeddings.npy"
        threshold_path = self.model_dir / "threshold.json"
        if not embeddings_path.exists() or not threshold_path.exists():
            return False

        import tensorflow as tf

        logger.info("Loading similarity-mode reference bank from %s", self.model_dir)
        self.embeddings = np.load(embeddings_path)
        meta = json.loads(threshold_path.read_text())
        self.similarity_threshold = float(meta["threshold"])
        self.top_k = int(meta.get("top_k", DEFAULT_TOP_K))

        override = os.getenv("SIMILARITY_THRESHOLD")
        if override:
            try:
                self.similarity_threshold = float(override)
                logger.info(
                    "Using SIMILARITY_THRESHOLD override from environment: %.3f",
                    self.similarity_threshold,
                )
            except ValueError:
                logger.warning("Ignoring invalid SIMILARITY_THRESHOLD env value: %r", override)

        self.feature_extractor = tf.keras.applications.MobileNetV2(
            input_shape=IMG_SIZE + (3,),
            include_top=False,
            weights="imagenet",
            pooling="avg",
        )
        self.mode = "similarity"
        logger.info(
            "Similarity mode ready: %d reference embeddings, threshold=%.3f, top_k=%d",
            self.embeddings.shape[0],
            self.similarity_threshold,
            self.top_k,
        )
        return True

    def _try_load_classifier_mode(self) -> bool:
        model_path_keras = self.model_dir / "dumper_truck_model.keras"
        model_path_h5 = self.model_dir / "dumper_truck_model.h5"
        class_names_path = self.model_dir / "class_names.json"

        model_path = None
        if model_path_keras.exists():
            model_path = model_path_keras
        elif model_path_h5.exists():
            model_path = model_path_h5

        if model_path is None or not class_names_path.exists():
            return False

        import tensorflow as tf

        logger.info("Loading classifier-mode model from %s", model_path)
        self.model = tf.keras.models.load_model(model_path)
        self.class_names = json.loads(class_names_path.read_text())
        self.mode = "classifier"
        logger.info("Classifier mode ready. Classes: %s", self.class_names)
        return True

    def _preprocessed_array(self, image: Image.Image) -> np.ndarray:
        import tensorflow as tf

        image = image.convert("RGB")
        if ENHANCE_VISIBILITY:
            image = enhance_visibility(image)
        image = image.resize(IMG_SIZE)
        array = np.array(image, dtype=np.float32)
        return tf.keras.applications.mobilenet_v2.preprocess_input(array)

    def predict(self, image: Image.Image) -> dict:
        if not self.is_loaded:
            raise RuntimeError(
                "Model is not loaded. Train it first with the notebook in "
                "model_training/, then make sure its output files ended up in "
                "backend/saved_model/."
            )

        if self.mode == "demo":
            return self._predict_demo(image)

        array = self._preprocessed_array(image)
        batch = np.expand_dims(array, axis=0)

        if self.mode == "similarity":
            return self._predict_similarity(batch)
        return self._predict_classifier(batch)

    def _predict_demo(self, image: Image.Image) -> dict:
        img = np.array(image.convert("RGB"))
        if ENHANCE_VISIBILITY:
            img = np.array(enhance_visibility(image))

        hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
        yellow_mask = cv2.inRange(hsv, np.array([15, 60, 60]), np.array([35, 255, 255]))
        yellow_ratio = float(np.sum(yellow_mask > 0) / (img.shape[0] * img.shape[1]))

        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        edge_ratio = float(np.sum(edges > 0) / (img.shape[0] * img.shape[1]))

        raw_score = float(min(0.98, max(0.18, (yellow_ratio * 3.5) + (edge_ratio * 1.6))))
        threshold = 0.50
        detected = raw_score >= threshold
        confidence = float(raw_score if detected else 1.0 - raw_score)

        return {
            "detected": detected,
            "label": POSITIVE_LABEL if detected else NEGATIVE_LABEL,
            "confidence": round(confidence, 3),
            "raw_score": round(raw_score, 3),
        }

    def _predict_similarity(self, batch: np.ndarray) -> dict:
        embedding = self.feature_extractor.predict(batch, verbose=0)[0]
        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)

        similarities = self.embeddings @ embedding
        k = min(self.top_k, similarities.shape[0])
        score = float(np.sort(similarities)[-k:].mean())

        detected = score >= self.similarity_threshold
        label = POSITIVE_LABEL if detected else NEGATIVE_LABEL
        confidence = max(0.0, min(1.0, score))

        return {
            "detected": detected,
            "label": label,
            "confidence": confidence,
            "raw_score": score,
        }

    def _predict_classifier(self, batch: np.ndarray) -> dict:
        # Binary sigmoid output: class 0 = class_names[0], class 1 = class_names[1].
        # image_dataset_from_directory assigns indices alphabetically by folder
        # name, and the notebook saves class_names in that same order, so this
        # stays correct regardless of which folder name sorts first.
        raw_score = float(self.model.predict(batch, verbose=0)[0][0])
        predicted_index = 1 if raw_score >= 0.5 else 0
        label = self.class_names[predicted_index]
        confidence = raw_score if predicted_index == 1 else 1.0 - raw_score

        return {
            "detected": label == POSITIVE_LABEL,
            "label": label,
            "confidence": confidence,
            "raw_score": raw_score,
        }


# Single shared instance, created at import time and reused across requests.
_model_dir_env = os.getenv("MODEL_DIR")
model_service = DumperTruckModel(_model_dir_env)
