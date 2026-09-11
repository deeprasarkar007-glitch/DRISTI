import { useState, useEffect } from "react";
import GlassWebcamDetector, { type PredictionResult } from "./GlassWebcamDetector";
import GlassTelemetryDashboard, { type TelemetryPacket } from "./GlassTelemetryDashboard";


interface GlassCommandCenterProps {
  viewMode: "unified" | "vision" | "telemetry";
  buzzerEnabled: boolean;
  onThreatLevelChange: (level: "CRITICAL" | "HIGH" | "CAUTION" | "SECURE") => void;
}

interface EventLog {
  id: string;
  timestamp: string;
  source: "VISION" | "RADAR" | "FOG" | "SYSTEM";
  message: string;
  type: "info" | "warning" | "danger" | "success";
}

export default function GlassCommandCenter({
  viewMode,
  buzzerEnabled,
  onThreatLevelChange,
}: GlassCommandCenterProps) {
  const [visionPrediction, setVisionPrediction] = useState<PredictionResult | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [logs, setLogs] = useState<EventLog[]>([]);

  // Log event helper
  const addLog = (
    source: EventLog["source"],
    message: string,
    type: EventLog["type"]
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-GB");
    setLogs((prev) => [
      {
        id: Math.random().toString(36).slice(2, 9),
        timestamp: timeStr,
        source,
        message,
        type,
      },
      ...prev.slice(0, 19),
    ]);
  };

  // Initial logs
  useEffect(() => {
    addLog("SYSTEM", "DRISTI Glassmorphic Mission Control initialized", "info");
    addLog("VISION", "Optical CNN target recognition channel connected", "info");
    addLog("RADAR", "ESP-NOW 2.4GHz Telemetry stream active for DRS-001", "info");
  }, []);

  // Handle vision changes
  const handlePredictionChange = (pred: PredictionResult | null) => {
    if (pred && pred.detected && (!visionPrediction || !visionPrediction.detected)) {
      addLog(
        "VISION",
        `Dumper Truck acquired ahead (${(pred.confidence * 100).toFixed(1)}% confidence)`,
        "danger"
      );
    }
    setVisionPrediction(pred);
  };

  // Handle telemetry changes
  const handleTelemetryChange = (data: TelemetryPacket) => {
    if (telemetry) {
      if (data.safety_status === "WARNING" && telemetry.safety_status !== "WARNING") {
        addLog(
          "RADAR",
          `CRITICAL PROXIMITY: Obstacle within ${data.distance_mm}mm! Warning buzzer active.`,
          "danger"
        );
      } else if (data.safety_status === "CAUTION" && telemetry.safety_status === "SAFE") {
        addLog("RADAR", `Proximity CAUTION: Obstacle in 100-200mm zone (${data.distance_mm}mm)`, "warning");
      }

      if (data.fog_status === "FOG ALERT" && telemetry.fog_status !== "FOG ALERT") {
        addLog(
          "FOG",
          `Fog conditions active: Hum ${Math.round(data.humidity)}%, Light ${Math.round(data.ambient_light)} Lux`,
          "warning"
        );
      }
    }
    setTelemetry(data);
  };

  // Multi-System Threat Computation
  const isVisionDetected = Boolean(visionPrediction?.detected);
  const isDistanceWarning = (telemetry?.distance_mm ?? 999) < 100;
  const isDistanceCaution = (telemetry?.distance_mm ?? 999) <= 200;
  const isFogAlert = Boolean(telemetry?.fog_status.includes("FOG"));

  let threatLevel: "CRITICAL" | "HIGH" | "CAUTION" | "SECURE" = "SECURE";
  let threatMessage = "All parameters nominal. Forward haul route safe.";

  if (isVisionDetected && (isDistanceWarning || isDistanceCaution)) {
    threatLevel = "CRITICAL";
    threatMessage = `🚨 IMMINENT IMPACT HAZARD: Dumper truck visually confirmed at ${telemetry?.distance_mm}mm distance! ENGAGE BRAKES.`;
  } else if (isDistanceWarning) {
    threatLevel = "CRITICAL";
    threatMessage = `⚠️ COLLISION ALARM: LiDAR reads object in <100mm threshold (${telemetry?.distance_mm}mm)!`;
  } else if (isVisionDetected && isFogAlert) {
    threatLevel = "HIGH";
    threatMessage = "🌫️ HAZARD: Dumper truck detected in dense fog conditions. Reduced speed advised.";
  } else if (isVisionDetected) {
    threatLevel = "HIGH";
    threatMessage = `TARGET ACQUIRED: Dumper truck detected in optical stream (${Math.round((visionPrediction?.confidence ?? 0) * 100)}% conf).`;
  } else if (isDistanceCaution) {
    threatLevel = "CAUTION";
    threatMessage = `CAUTION: Approaching object in 100-200mm buffer zone (${telemetry?.distance_mm}mm).`;
  } else if (isFogAlert) {
    threatLevel = "CAUTION";
    threatMessage = "ATMOSPHERIC ADVISORY: Fog threshold reached. Optical clarity degraded; radar guidance engaged.";
  }

  useEffect(() => {
    onThreatLevelChange(threatLevel);
  }, [threatLevel, onThreatLevelChange]);

  const threatBannerBorder =
    threatLevel === "CRITICAL"
      ? "border-red-500/60 bg-red-950/30 text-red-200 shadow-xl shadow-red-900/30"
      : threatLevel === "HIGH"
      ? "border-orange-500/60 bg-orange-950/30 text-orange-200 shadow-xl shadow-orange-900/20"
      : threatLevel === "CAUTION"
      ? "border-amber-500/60 bg-amber-950/30 text-amber-200 shadow-xl shadow-amber-900/20"
      : "border-emerald-500/60 bg-emerald-950/30 text-emerald-200 shadow-xl shadow-emerald-900/20";

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 pt-24 pb-8 px-4">
      {/* SYSTEM CORRELATION STATUS BANNER */}
      <div
        className={`glass-panel rounded-2xl p-4 transition-all duration-300 flex items-center justify-between gap-4 ${threatBannerBorder}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl animate-pulse">
            {threatLevel === "CRITICAL"
              ? "🚨"
              : threatLevel === "HIGH"
              ? "⚡"
              : threatLevel === "CAUTION"
              ? "⚠️"
              : "🛡️"}
          </span>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">
              Cross-System Threat Correlation
            </div>
            <div className="text-xs sm:text-sm font-semibold tracking-wide mt-0.5">
              {threatMessage}
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
          <span className="glass-pill px-3 py-1 rounded-lg">
            OPTICAL: {isVisionDetected ? "TARGET ACQUIRED" : "CLEAR"}
          </span>
          <span className="glass-pill px-3 py-1 rounded-lg">
            RADAR: {telemetry?.safety_status ?? "SAFE"}
          </span>
        </div>
      </div>

      {/* DUAL COCKPIT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: AI VISION TERMINAL */}
        {(viewMode === "unified" || viewMode === "vision") && (
          <div className={viewMode === "vision" ? "lg:col-span-12" : "lg:col-span-6"}>
            <GlassWebcamDetector onPredictionChange={handlePredictionChange} />
          </div>
        )}

        {/* RIGHT: IOT TELEMETRY & RADAR TERMINAL */}
        {(viewMode === "unified" || viewMode === "telemetry") && (
          <div className={viewMode === "telemetry" ? "lg:col-span-12" : "lg:col-span-6"}>
            <GlassTelemetryDashboard
              onTelemetryChange={handleTelemetryChange}
              buzzerEnabled={buzzerEnabled}
            />
          </div>
        )}
      </div>

      {/* REAL-TIME FLIGHT & SAFETY AUDIT LOG */}
      <div className="glass-panel rounded-2xl p-4.5 shadow-2xl flex flex-col gap-2.5 text-xs font-mono">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2 text-white font-bold tracking-wide">
            <span>📋</span> REAL-TIME FLIGHT & SAFETY AUDIT TRAIL
          </div>
          <span className="text-white/40 text-[11px]">
            Latest {logs.length} telemetry records
          </span>
        </div>

        <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
          {logs.map((log) => {
            const badge =
              log.type === "danger"
                ? "bg-red-500/20 text-red-300 border-red-500/40"
                : log.type === "warning"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : log.type === "success"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-blue-500/20 text-blue-300 border-blue-500/40";

            return (
              <div
                key={log.id}
                className="flex items-center gap-3 py-1 px-2.5 rounded-lg bg-black/30 border border-white/5"
              >
                <span className="text-white/40 text-[11px] shrink-0">
                  {log.timestamp}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${badge}`}
                >
                  {log.source}
                </span>
                <span className="text-white/80 truncate">{log.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
