from pydantic import BaseModel


class PredictionResponse(BaseModel):
    detected: bool
    label: str
    confidence: float  # 0.0 - 1.0, confidence in `label`
    raw_score: float  # raw sigmoid output, 0.0 - 1.0


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    detection_mode: str | None = None  # "similarity" | "classifier" | None
    class_names: list[str] | None = None
    similarity_threshold: float | None = None
    visibility_enhancement_enabled: bool
