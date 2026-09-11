<<<<<<< HEAD
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
        logger.warning(
            "No trained model found in %s. /predict will return 503 until you "
            "run the training notebook and its output files end up there.",
            self.model_dir,
        )

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

        array = self._preprocessed_array(image)
        batch = np.expand_dims(array, axis=0)

        if self.mode == "similarity":
            return self._predict_similarity(batch)
        return self._predict_classifier(batch)

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
=======
import json
from pathlib import Path

import numpy as np
from PIL import Image
import tensorflow as tf


MODEL_DIR = Path(__file__).resolve().parent.parent / "saved_model"

MODEL_PATH = MODEL_DIR / "dumper_truck_model.keras"
CLASS_NAMES_PATH = MODEL_DIR / "class_names.json"

model = tf.keras.models.load_model(MODEL_PATH)

with open(CLASS_NAMES_PATH, "r") as f:
    class_names = json.load(f)


def predict(image: Image.Image):

    image = image.convert("RGB")
    image = image.resize((224, 224))

    img = np.array(image, dtype=np.float32)

    img = tf.keras.applications.mobilenet_v2.preprocess_input(img)

    img = np.expand_dims(img, axis=0)

    prediction = model.predict(img, verbose=0)[0][0]

    # class index 0 = dumper_truck
    # class index 1 = no_dumper_truck

    if prediction < 0.5:

        label = "dumper_truck"
        confidence = 1 - prediction
        detected = True

    else:

        label = "no_dumper_truck"
        confidence = prediction
        detected = False

    return {
        "detected": detected,
        "label": label,
        "confidence": float(confidence)
    }
class ModelService:
    def predict(self, image):
        return predict(image)


model_service = ModelService()
>>>>>>> 2093726 (Add dumper-truck-detector files)
