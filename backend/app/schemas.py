from pydantic import BaseModel


class PredictionResponse(BaseModel):
    detected: bool
    label: str
    confidence: float  # 0.0 - 1.0, confidence in `label`
    raw_score: float  # raw sigmoid output, 0.0 - 1.0


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    class_names: list[str] | None = None
