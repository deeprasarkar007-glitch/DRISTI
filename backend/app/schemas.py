from pydantic import BaseModel


class PredictionResponse(BaseModel):
    detected: bool
    label: str
    confidence: float  # 0.0 - 1.0, confidence in `label`
    raw_score: float  # raw sigmoid output, 0.0 - 1.0


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    detection_mode: str | None = None
    class_names: list[str] | None = None
    similarity_threshold: float | None = None
    visibility_enhancement_enabled: bool | None = None


class TelemetryData(BaseModel):
    vehicle_id: str = "DRS-001"
    zone: str = "A3"
    packet: int = 0
    temperature: float = 24.0
    humidity: float = 60.0
    ambient_light: float = 300.0
    distance_mm: int = 500
    object_detected: bool = False
    obstacle_detected: bool = False
    fog_status: str = "CLEAR"
    safety_status: str = "SAFE"
    rssi: int = -70
    proximity: str = "CLOSE"
