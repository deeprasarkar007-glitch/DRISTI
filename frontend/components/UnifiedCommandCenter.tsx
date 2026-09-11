"use client";

import { useState, useEffect } from "react";
import WebcamDetector, { PredictionResult } from "./WebcamDetector";
import TelemetryDashboard, { TelemetryPacket } from "./TelemetryDashboard";

type ViewMode = "unified" | "vision" | "telemetry";

interface EventLog {
  id: string;
  timestamp: string;
  source: "VISION" | "RADAR" | "FOG" | "SYSTEM";
  message: string;
  type: "info" | "warning" | "danger" | "success";
}

export default function UnifiedCommandCenter() {
  const [viewMode, setViewMode] = useState<ViewMode>("unified");
  const [visionPrediction, setVisionPrediction] = useState<PredictionResult | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPacket | null>(null);
  const [buzzerEnabled, setBuzzerEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [logs, setLogs] = useState<EventLog[]>([]);

  // Live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-GB") + "." + String(now.getMilliseconds()).padStart(3, "0").slice(0, 2));
    };
    updateTime();
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, []);

  // Helper to append events
  const addLog = (source: EventLog["source"], message: string, type: EventLog["type"]) => {
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
      ...prev.slice(0, 19), // Keep latest 20 logs
    ]);
  };

  // Log on initial mount
  useEffect(() => {
    addLog("SYSTEM", "DRISTI Mining Safety Command Center initialized", "info");
    addLog("VISION", "AI Frame Ingestion pipeline initialized (/predict)", "info");
    addLog("RADAR", "ESP-NOW Telemetry listener active for vehicle DRS-001", "info");
  }, []);

  // Track vision changes
  const handlePredictionChange = (pred: PredictionResult | null) => {
    if (pred && pred.detected && (!visionPrediction || !visionPrediction.detected)) {
      addLog(
        "VISION",
        `Dumper Truck visually acquired with ${(pred.confidence * 100).toFixed(1)}% confidence`,
        "danger"
      );
    }
    setVisionPrediction(pred);
  };

  // Track telemetry changes
  const handleTelemetryChange = (data: TelemetryPacket) => {
    // Check for state transitions
    if (telemetry) {
      if (data.safety_status === "WARNING" && telemetry.safety_status !== "WARNING") {
        addLog(
          "RADAR",
          `CRITICAL: Obstacle detected within ${data.distance_mm}mm! Warning buzzer active.`,
          "danger"
        );
      } else if (data.safety_status === "CAUTION" && telemetry.safety_status === "SAFE") {
        addLog(
          "RADAR",
          `Proximity CAUTION: Obstacle at ${data.distance_mm}mm`,
          "warning"
        );
      }

      if (data.fog_status === "FOG ALERT" && telemetry.fog_status !== "FOG ALERT") {
        addLog(
          "FOG",
          `Atmospheric hazard: Humidity (${Math.round(data.humidity)}%) & Lux (${Math.round(data.ambient_light)}) reached fog threshold`,
          "warning"
        );
      }
    }
    setTelemetry(data);
  };

  // Multi-System Threat Level Computation
  const isVisionDetected = Boolean(visionPrediction?.detected);
  const isDistanceWarning = (telemetry?.distance_mm ?? 999) < 100;
  const isDistanceCaution = (telemetry?.distance_mm ?? 999) <= 200;
  const isFogAlert = telemetry?.fog_status.includes("FOG");

  // Threat Matrix:
  // 1. CRITICAL THREAT: Vision confirms dumper truck AND Distance < 200mm (or < 100mm)
  // 2. HIGH RISK: Distance < 100mm OR (Vision detected + Fog Alert)
  // 3. ELEVATED CAUTION: Distance 100-200mm OR Fog Alert
  // 4. NORMAL SECURE: Safe distance, clear fog, no visual obstacles
  let threatLevel: "CRITICAL" | "HIGH" | "CAUTION" | "SECURE" = "SECURE";
  let threatMessage = "All parameters nominal. Haul route clear.";

  if (isVisionDetected && (isDistanceWarning || isDistanceCaution)) {
    threatLevel = "CRITICAL";
    threatMessage = `IMMINENT IMPACT THREAT: Visual dumper truck target confirmed at ${telemetry?.distance_mm}mm LiDAR distance!`;
  } else if (isDistanceWarning) {
    threatLevel = "CRITICAL";
    threatMessage = `CRITICAL PROXIMITY: LiDAR confirms object at ${telemetry?.distance_mm}mm!`;
  } else if (isVisionDetected && isFogAlert) {
    threatLevel = "HIGH";
    threatMessage = "HAZARD: Dumper truck detected in dense fog conditions. Reduced braking distance advised.";
  } else if (isVisionDetected) {
    threatLevel = "HIGH";
    threatMessage = `TARGET IN SIGHT: Dumper truck detected visually ahead (${Math.round((visionPrediction?.confidence ?? 0) * 100)}% conf).`;
  } else if (isDistanceCaution) {
    threatLevel = "CAUTION";
    threatMessage = `CAUTION: Obstacle in 100-200mm zone (${telemetry?.distance_mm}mm). Maintain defensive spacing.`;
  } else if (isFogAlert) {
    threatLevel = "CAUTION";
    threatMessage = "ATMOSPHERIC ADVISORY: Fog conditions detected. Night/Low-light vision enhancement engaged.";
  }

  const threatColor =
    threatLevel === "CRITICAL"
      ? "bg-red-500 text-white animate-pulse shadow-red-500/50"
      : threatLevel === "HIGH"
      ? "bg-orange-500 text-white shadow-orange-500/40"
      : threatLevel === "CAUTION"
      ? "bg-amber-500 text-black shadow-amber-500/40"
      : "bg-emerald-500 text-white shadow-emerald-500/40";

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 px-4 py-6">
      {/* COMMAND CENTER MASTER HEADER */}
      <header className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-2xl font-black text-white">
              👁️
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-wider text-white font-mono">
                DRISTI
              </h1>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold font-mono tracking-widest uppercase bg-indigo-950/80 text-indigo-300 border border-indigo-700/60">
                SAFETY MISSION CONTROL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Safe & Efficient Operation of Mine Vehicles in Fog & Low-Visibility Conditions
            </p>
          </div>
        </div>

        {/* COMBINED THREAT INDICATOR */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2">
            <div className="text-right">
              <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                THREAT LEVEL
              </span>
              <div className="text-xs font-mono text-slate-300">
                CORRELATED STATUS
              </div>
            </div>
            <div
              className={`px-3 py-1 rounded-lg font-mono font-black text-sm tracking-wider shadow-lg ${threatColor}`}
            >
              {threatLevel}
            </div>
          </div>

          <div className="hidden xl:flex flex-col items-end font-mono text-xs text-slate-400">
            <div className="text-white font-bold">{currentTime || "00:00:00"}</div>
            <div className="text-[11px] text-cyan-400">ZONE A3 • IRON ORE PIT</div>
          </div>
        </div>
      </header>

      {/* VIEW SWITCHER & AUDIO TOGGLE SUB-BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 mr-2">LAYOUT VIEW:</span>
          <button
            type="button"
            onClick={() => setViewMode("unified")}
            className={`px-3 py-1.5 rounded-lg transition-all font-semibold ${
              viewMode === "unified"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Dual Cockpit (Merged)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("vision")}
            className={`px-3 py-1.5 rounded-lg transition-all font-semibold ${
              viewMode === "vision"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            AI Vision HUD
          </button>
          <button
            type="button"
            onClick={() => setViewMode("telemetry")}
            className={`px-3 py-1.5 rounded-lg transition-all font-semibold ${
              viewMode === "telemetry"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            IoT Telemetry Radar
          </button>
        </div>

        {/* Threat Summary Pill */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">SYSTEM CORRELATION:</span>
          <span className="text-slate-200 font-semibold truncate max-w-md">
            {threatMessage}
          </span>
        </div>
      </div>

      {/* MAIN CONTENT AREA: DUAL COCKPIT LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: AI COMPUTER VISION (MODULE 1) */}
        {(viewMode === "unified" || viewMode === "vision") && (
          <div
            className={`flex flex-col gap-4 ${
              viewMode === "vision" ? "lg:col-span-12" : "lg:col-span-6"
            }`}
          >
            <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-indigo-400 text-base">📷</span>
                <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                  MODULE 1: AI OPTICAL VISION & OBJECT RECOGNITION
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950 border border-indigo-700/50 text-indigo-300">
                FASTAPI CNN
              </span>
            </div>

            <WebcamDetector onPredictionChange={handlePredictionChange} />
          </div>
        )}

        {/* RIGHT COLUMN: IOT TELEMETRY & ANTI-COLLISION (MODULE 2) */}
        {(viewMode === "unified" || viewMode === "telemetry") && (
          <div
            className={`flex flex-col gap-4 ${
              viewMode === "telemetry" ? "lg:col-span-12" : "lg:col-span-6"
            }`}
          >
            <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 text-base">📡</span>
                <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                  MODULE 2: ESP32 SENSOR MESH & ANTI-COLLISION RADAR
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 border border-cyan-700/50 text-cyan-300">
                ESP-NOW 2.4GHz
              </span>
            </div>

            <TelemetryDashboard
              onTelemetryChange={handleTelemetryChange}
              buzzerEnabled={buzzerEnabled}
              onToggleBuzzer={() => setBuzzerEnabled(!buzzerEnabled)}
            />
          </div>
        )}
      </div>

      {/* SYSTEM EVENT LOG & TELEMETRY TIMELINE */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl text-xs font-mono">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2 text-slate-300 font-bold tracking-wide">
            <span>📋</span> REAL-TIME FLIGHT & SAFETY AUDIT LOG
          </div>
          <span className="text-slate-500 text-[11px]">
            Showing latest {logs.length} events
          </span>
        </div>

        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
          {logs.map((log) => {
            const badgeColor =
              log.type === "danger"
                ? "text-red-400 bg-red-950/60 border-red-800"
                : log.type === "warning"
                ? "text-amber-400 bg-amber-950/60 border-amber-800"
                : log.type === "success"
                ? "text-emerald-400 bg-emerald-950/60 border-emerald-800"
                : "text-blue-400 bg-blue-950/60 border-blue-800";

            return (
              <div
                key={log.id}
                className="flex items-center gap-3 py-1 px-2 rounded bg-slate-950/40 border border-slate-800/60"
              >
                <span className="text-slate-500 text-[11px]">{log.timestamp}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                  {log.source}
                </span>
                <span className="text-slate-300 flex-1 truncate">{log.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
