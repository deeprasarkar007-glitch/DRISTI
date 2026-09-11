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
    def __init__(self):
        self.is_loaded = model is not None
        self.class_names = class_names if model is not None else []

    def predict(self, image):
        return predict(image)


model_service = ModelService()