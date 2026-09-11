"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TelemetryPacket {
  vehicle_id: string;
  zone: string;
  packet: number;
  temperature: number;
  humidity: number;
  ambient_light: number;
  distance_mm: number;
  object_detected: boolean;
  obstacle_detected: boolean;
  fog_status: string;
  safety_status: string;
  rssi: number;
  proximity: string;
}

const DEFAULT_TELEMETRY: TelemetryPacket = {
  vehicle_id: "DRS-001",
  zone: "A3",
  packet: 104,
  temperature: 24.8,
  humidity: 82.0,
  ambient_light: 65.0,
  distance_mm: 185,
  object_detected: true,
  obstacle_detected: true,
  fog_status: "FOG CAN FORM",
  safety_status: "CAUTION",
  rssi: -74,
  proximity: "CLOSE",
};

interface TelemetryDashboardProps {
  onTelemetryChange?: (data: TelemetryPacket) => void;
  buzzerEnabled?: boolean;
  onToggleBuzzer?: () => void;
}

export default function TelemetryDashboard({
  onTelemetryChange,
  buzzerEnabled = true,
  onToggleBuzzer,
}: TelemetryDashboardProps) {
  const [telemetry, setTelemetry] = useState<TelemetryPacket>(DEFAULT_TELEMETRY);
  const [isSimulating, setIsSimulating] = useState(false);
  const [autoSimulate, setAutoSimulate] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialSupported, setSerialSupported] = useState(false);
  const [serialStatusText, setSerialStatusText] = useState("Disconnected");

  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buzzerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check WebSerial API support on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "serial" in navigator) {
      setSerialSupported(true);
    }
  }, []);

  // Broadcast telemetry updates
  useEffect(() => {
    onTelemetryChange?.(telemetry);
  }, [telemetry, onTelemetryChange]);

  // Web Audio buzzer synthesizer matching ESP32 firmware buzzer logic
  const triggerBuzzerSound = useCallback((freq: number, durationMs: number) => {
    if (!buzzerEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      // Audio might be blocked until first user interaction
    }
  }, [buzzerEnabled]);

  // Buzzer loop matching sender_esp.ino / esp_code.ino:
  // WARNING: 700ms interval, 120ms beep (880 Hz)
  // CAUTION: 1500ms interval, 180ms beep (540 Hz)
  useEffect(() => {
    if (buzzerIntervalRef.current) {
      clearInterval(buzzerIntervalRef.current);
      buzzerIntervalRef.current = null;
    }

    if (!buzzerEnabled) return;

    if (telemetry.safety_status === "WARNING" || telemetry.distance_mm < 100) {
      buzzerIntervalRef.current = setInterval(() => {
        triggerBuzzerSound(880, 120);
      }, 700);
    } else if (telemetry.safety_status === "CAUTION" || telemetry.distance_mm <= 200) {
      buzzerIntervalRef.current = setInterval(() => {
        triggerBuzzerSound(540, 180);
      }, 1500);
    }

    return () => {
      if (buzzerIntervalRef.current) {
        clearInterval(buzzerIntervalRef.current);
      }
    };
  }, [telemetry.safety_status, telemetry.distance_mm, buzzerEnabled, triggerBuzzerSound]);

  // Recalculate status from physical rules matching esp_code.ino
  const updateTelemetryValues = (partial: Partial<TelemetryPacket>) => {
    setTelemetry((prev) => {
      const next = { ...prev, ...partial };

      // Distance logic: WARNING < 100mm, CAUTION 100-200mm, SAFE > 200mm
      if (next.distance_mm < 100) {
        next.safety_status = "WARNING";
      } else if (next.distance_mm <= 200) {
        next.safety_status = "CAUTION";
      } else {
        next.safety_status = "SAFE";
      }

      // Fog logic: Humidity >= 75% AND Light <= 100 lux => FOG CAN FORM
      if (next.humidity >= 75.0 && next.ambient_light <= 100.0) {
        next.fog_status = "FOG ALERT";
      } else {
        next.fog_status = "CLEAR";
      }

      // Proximity from RSSI matching receiver_esp.ino
      if (next.rssi >= -65) {
        next.proximity = "VERY CLOSE";
      } else if (next.rssi >= -78) {
        next.proximity = "CLOSE";
      } else if (next.rssi >= -88) {
        next.proximity = "MEDIUM";
      } else if (next.rssi >= -96) {
        next.proximity = "FAR";
      } else {
        next.proximity = "VERY FAR";
      }

      next.obstacle_detected = next.object_detected || next.distance_mm <= 200;
      next.packet = prev.packet + 1;

      return next;
    });
  };

  // WebSerial Connection for real ESP32 Receiver
  const handleConnectSerial = async () => {
    if (!serialSupported) {
      alert("WebSerial is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (serialConnected) {
      try {
        await serialReaderRef.current?.cancel();
        await serialPortRef.current?.close();
      } catch (err) {
        console.error("Error closing serial:", err);
      }
      setSerialConnected(false);
      setSerialStatusText("Disconnected");
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setSerialConnected(true);
      setSerialStatusText("ESP32 Connected (115200 baud)");

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = "";

      // Background read loop
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += value;
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                  try {
                    const parsed = JSON.parse(trimmed);
                    setTelemetry((prev) => ({
                      ...prev,
                      ...parsed,
                      packet: parsed.packet || prev.packet + 1,
                    }));
                  } catch (jsonErr) {
                    // ignore non-json log lines
                  }
                }
              }
            }
          }
        } catch (readErr) {
          console.error("Serial read error:", readErr);
        } finally {
          setSerialConnected(false);
          setSerialStatusText("Disconnected");
        }
      })();
    } catch (err: any) {
      console.error("Serial open error:", err);
      setSerialStatusText(`Failed: ${err.message || "No port selected"}`);
    }
  };

  // Automated mine vehicle approach simulation
  useEffect(() => {
    if (!autoSimulate) return;

    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % 40;
      // Cycle distance from 700mm down to 60mm and back up
      const dist = Math.round(
        step <= 20
          ? 700 - (step * (700 - 60)) / 20
          : 60 + ((step - 20) * (700 - 60)) / 20
      );

      const irTrigger = dist < 220;
      const rssi = Math.round(-95 + (700 - dist) * 0.08);

      updateTelemetryValues({
        distance_mm: dist,
        object_detected: irTrigger,
        rssi: Math.min(-45, Math.max(-98, rssi)),
      });
    }, 450);

    return () => clearInterval(interval);
  }, [autoSimulate]);

  // Helper styles
  const isDanger = telemetry.safety_status === "WARNING" || telemetry.distance_mm < 100;
  const isCaution = telemetry.safety_status === "CAUTION" || (telemetry.distance_mm >= 100 && telemetry.distance_mm <= 200);
  const isFogAlert = telemetry.fog_status.includes("FOG");

  const safetyColor = isDanger
    ? "text-red-400 bg-red-950/60 border-red-500 shadow-red-900/50"
    : isCaution
    ? "text-amber-400 bg-amber-950/60 border-amber-500 shadow-amber-900/50"
    : "text-emerald-400 bg-emerald-950/60 border-emerald-500 shadow-emerald-900/50";

  return (
    <div className="w-full flex flex-col gap-5 text-slate-100">
      {/* VEHICLE & LINK HEADER */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-lg">
            🚛
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-lg text-white">
                {telemetry.vehicle_id}
              </span>
              <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-blue-900/50 text-blue-300 border border-blue-700/50 rounded">
                ZONE {telemetry.zone}
              </span>
              <span className="px-2 py-0.5 text-xs font-mono bg-slate-800 text-slate-400 border border-slate-700 rounded">
                PKT #{telemetry.packet}
              </span>
            </div>
            <p className="text-xs text-slate-400">Open-Cast Mine Heavy Vehicle Telemetry</p>
          </div>
        </div>

        {/* CONTROLS & CONNECTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Audio Buzzer Button */}
          <button
            type="button"
            onClick={onToggleBuzzer}
            className={`px-3 py-1.5 rounded-lg border font-mono transition-all flex items-center gap-1.5 ${
              buzzerEnabled
                ? "bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30"
                : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-300"
            }`}
            title="Toggle Vehicle Warning Buzzer sound"
          >
            <span>{buzzerEnabled ? "🔊" : "🔇"}</span>
            <span>BUZZER: {buzzerEnabled ? "ACTIVE" : "MUTED"}</span>
          </button>

          {/* WebSerial Connect Button */}
          {serialSupported && (
            <button
              type="button"
              onClick={handleConnectSerial}
              className={`px-3 py-1.5 rounded-lg border font-mono transition-all flex items-center gap-1.5 ${
                serialConnected
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-900/30"
                  : "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/30"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${serialConnected ? "bg-emerald-400 animate-ping" : "bg-slate-500"}`} />
              <span>{serialConnected ? "ESP32 LINKED" : "CONNECT ESP32"}</span>
            </button>
          )}

          {/* Simulator Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-3 py-1.5 rounded-lg border font-mono transition-all flex items-center gap-1.5 ${
              isSimulating
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            <span>🎛️</span>
            <span>{isSimulating ? "SIMULATOR: ON" : "SIMULATE"}</span>
          </button>
        </div>
      </div>

      {/* DYNAMIC COLLISION & STATUS BANNER */}
      <div
        className={`rounded-xl border p-4 shadow-lg transition-all duration-300 flex items-center justify-between gap-4 ${safetyColor}`}
      >
        <div className="flex items-center gap-3.5">
          <div className="text-2xl animate-bounce">
            {isDanger ? "🚨" : isCaution ? "⚠️" : "🛡️"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-wider text-base uppercase">
                COLLISION STATUS: {telemetry.safety_status}
              </span>
              {isDanger && (
                <span className="px-2 py-0.5 text-xs bg-red-600 text-white font-bold rounded animate-pulse">
                  IMMEDIATE STOP
                </span>
              )}
            </div>
            <p className="text-xs opacity-90">
              {isDanger
                ? "CRITICAL PROXIMITY: Obstacle within 100mm collision zone!"
                : isCaution
                ? "CAUTION DISTANCE: Obstacle approaching between 100-200mm."
                : "SURROUND CLEAR: Forward haul route safe."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs uppercase opacity-75 font-mono">ESP-NOW PROXIMITY</span>
            <div className="font-mono font-bold text-sm text-white">
              {telemetry.proximity} ({telemetry.rssi} dBm)
            </div>
          </div>
        </div>
      </div>

      {/* CORE TELEMETRY METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CARD 1: VL53L0X LASER DISTANCE & IR OBSTACLE */}
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">📡</span>
              <h3 className="font-semibold text-sm tracking-wide text-slate-200">
                VL53L0X ToF LASER RADAR
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">RANGE 0-2000mm</span>
          </div>

          <div className="py-4 flex flex-col items-center">
            {/* Visual Circular/Bar Radar Meter */}
            <div className="relative w-44 h-24 flex items-center justify-center overflow-hidden">
              {/* Radar Arch */}
              <div className="absolute top-0 w-44 h-44 rounded-full border-4 border-dashed border-slate-700/60" />
              <div
                className={`absolute top-0 w-44 h-44 rounded-full border-4 transition-all duration-300 ${
                  isDanger
                    ? "border-red-500 shadow-lg shadow-red-500/40"
                    : isCaution
                    ? "border-amber-500 shadow-lg shadow-amber-500/40"
                    : "border-emerald-500 shadow-lg shadow-emerald-500/40"
                }`}
                style={{
                  clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
                  transform: `rotate(${Math.min(180, (telemetry.distance_mm / 600) * 180)}deg)`,
                }}
              />
              <div className="text-center z-10 pt-4">
                <span className="font-mono text-3xl font-black text-white">
                  {telemetry.distance_mm >= 9999 ? "--" : telemetry.distance_mm}
                </span>
                <span className="text-xs text-slate-400 ml-1">mm</span>
                <div className="text-xs font-mono text-slate-400">
                  ({(telemetry.distance_mm / 10).toFixed(1)} cm)
                </div>
              </div>
            </div>

            {/* Distance Progress Indicator */}
            <div className="w-full mt-3">
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>0mm</span>
                <span className="text-red-400">100mm (WARN)</span>
                <span className="text-amber-400">200mm (CAUTION)</span>
                <span>600mm+</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div
                  className={`h-full transition-all duration-300 ${
                    isDanger ? "bg-red-500" : isCaution ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, (telemetry.distance_mm / 600) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* IR SENSOR SUB-BAR */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span>⚡</span> IR Obstacle Sensor (GPIO 27):
            </span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded ${
                telemetry.object_detected
                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {telemetry.object_detected ? "OBJECT DETECTED" : "CLEAR"}
            </span>
          </div>
        </div>

        {/* CARD 2: ATMOSPHERIC & FOG HAZARD STATION */}
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">🌫️</span>
              <h3 className="font-semibold text-sm tracking-wide text-slate-200">
                ATMOSPHERIC & FOG RISK HEURISTIC
              </h3>
            </div>
            <span
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded border ${
                isFogAlert
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
              }`}
            >
              {telemetry.fog_status}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 py-4 text-center">
            {/* Humidity */}
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400 mb-1">Humidity</span>
              <span
                className={`text-2xl font-black font-mono ${
                  telemetry.humidity >= 75 ? "text-cyan-300" : "text-white"
                }`}
              >
                {Math.round(telemetry.humidity)}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Rule: &ge;75%</span>
            </div>

            {/* Ambient Light (Lux) */}
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400 mb-1">Ambient Light</span>
              <span
                className={`text-2xl font-black font-mono ${
                  telemetry.ambient_light <= 100 ? "text-amber-300" : "text-white"
                }`}
              >
                {Math.round(telemetry.ambient_light)}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Rule: &le;100 Lux</span>
            </div>

            {/* Temperature */}
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400 mb-1">Temperature</span>
              <span className="text-2xl font-black font-mono text-white">
                {telemetry.temperature.toFixed(1)}°
              </span>
              <span className="text-[10px] text-slate-400 mt-1">DHT22 Sensor</span>
            </div>
          </div>

          {/* Fog Rule Advisory Note */}
          <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
            <span>Fog Formula: Hum &ge; 75% + Light &le; 100 Lux</span>
            <span className={isFogAlert ? "text-amber-300 font-semibold" : "text-emerald-400"}>
              {isFogAlert ? "⚡ Low visibility warning enabled" : "✓ Optimal open pit visibility"}
            </span>
          </div>
        </div>
      </div>

      {/* SIMULATOR CONTROLS (EXPANDABLE) */}
      {isSimulating && (
        <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-5 shadow-2xl animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2 text-cyan-300 font-mono text-sm font-bold">
              <span>🎛️</span> HARDWARE TELEMETRY SIMULATOR & TUNING CONSOLE
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSimulate}
                  onChange={(e) => setAutoSimulate(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
                />
                <span>Auto-Cycle Approach Demo</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            {/* Distance Slider */}
            <div>
              <div className="flex justify-between mb-1.5 font-mono">
                <span className="text-slate-400">LiDAR Distance (mm):</span>
                <span className="text-white font-bold">{telemetry.distance_mm} mm</span>
              </div>
              <input
                type="range"
                min="30"
                max="800"
                step="5"
                value={telemetry.distance_mm}
                onChange={(e) => updateTelemetryValues({ distance_mm: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ distance_mm: 70 })}
                  className="px-2 py-0.5 rounded bg-red-950/60 border border-red-700 text-red-300 text-[10px]"
                >
                  Force 70mm (Warn)
                </button>
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ distance_mm: 160 })}
                  className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700 text-amber-300 text-[10px]"
                >
                  Force 160mm (Caution)
                </button>
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ distance_mm: 500 })}
                  className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-[10px]"
                >
                  Force 500mm (Safe)
                </button>
              </div>
            </div>

            {/* Humidity Slider */}
            <div>
              <div className="flex justify-between mb-1.5 font-mono">
                <span className="text-slate-400">DHT22 Humidity (%):</span>
                <span className="text-white font-bold">{Math.round(telemetry.humidity)}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="98"
                step="1"
                value={telemetry.humidity}
                onChange={(e) => updateTelemetryValues({ humidity: Number(e.target.value) })}
                className="w-full accent-blue-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Clear (30%)</span>
                <span>Fog Trigger (&ge;75%)</span>
                <span>Saturated (98%)</span>
              </div>
            </div>

            {/* Ambient Light Slider */}
            <div>
              <div className="flex justify-between mb-1.5 font-mono">
                <span className="text-slate-400">BH1750 Ambient Light (Lux):</span>
                <span className="text-white font-bold">{Math.round(telemetry.ambient_light)} Lux</span>
              </div>
              <input
                type="range"
                min="5"
                max="800"
                step="5"
                value={telemetry.ambient_light}
                onChange={(e) => updateTelemetryValues({ ambient_light: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ humidity: 88, ambient_light: 45 })}
                  className="px-2 py-0.5 rounded bg-blue-900/60 border border-blue-600 text-blue-200 text-[10px]"
                >
                  Fog Preset (88% / 45 Lux)
                </button>
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ humidity: 45, ambient_light: 650 })}
                  className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px]"
                >
                  Clear Sunny Preset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
