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
  packet: 120,
  temperature: 25.2,
  humidity: 82.0,
  ambient_light: 60.0,
  distance_mm: 175,
  object_detected: true,
  obstacle_detected: true,
  fog_status: "FOG CAN FORM",
  safety_status: "CAUTION",
  rssi: -72,
  proximity: "CLOSE",
};

interface GlassTelemetryDashboardProps {
  onTelemetryChange?: (data: TelemetryPacket) => void;
  buzzerEnabled?: boolean;
}

export default function GlassTelemetryDashboard({
  onTelemetryChange,
  buzzerEnabled = true,
}: GlassTelemetryDashboardProps) {
  const [telemetry, setTelemetry] = useState<TelemetryPacket>(DEFAULT_TELEMETRY);
  const [isSimulating, setIsSimulating] = useState(false);
  const [autoSimulate, setAutoSimulate] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialSupported, setSerialSupported] = useState(false);

  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buzzerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check WebSerial API support
  useEffect(() => {
    if (typeof window !== "undefined" && "serial" in navigator) {
      setSerialSupported(true);
    }
  }, []);

  // Broadcast updates
  useEffect(() => {
    onTelemetryChange?.(telemetry);
  }, [telemetry, onTelemetryChange]);

  // Audio buzzer synthesizer matching ESP32 firmware
  const triggerBuzzerSound = useCallback(
    (freq: number, durationMs: number) => {
      if (!buzzerEnabled) return;
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
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
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + durationMs / 1000
        );

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + durationMs / 1000);
      } catch (e) {
        // Audio might be blocked until first user gesture
      }
    },
    [buzzerEnabled]
  );

  // Buzzer loop: WARNING = 700ms/120ms (880Hz), CAUTION = 1500ms/180ms (540Hz)
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
    } else if (
      telemetry.safety_status === "CAUTION" ||
      telemetry.distance_mm <= 200
    ) {
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

  // Recalculate status from ESP32 rules
  const updateTelemetryValues = (partial: Partial<TelemetryPacket>) => {
    setTelemetry((prev) => {
      const next = { ...prev, ...partial };

      if (next.distance_mm < 100) {
        next.safety_status = "WARNING";
      } else if (next.distance_mm <= 200) {
        next.safety_status = "CAUTION";
      } else {
        next.safety_status = "SAFE";
      }

      if (next.humidity >= 75.0 && next.ambient_light <= 100.0) {
        next.fog_status = "FOG ALERT";
      } else {
        next.fog_status = "CLEAR";
      }

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
      alert("WebSerial is not supported in this browser. Use Chrome or Edge.");
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
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setSerialConnected(true);

      const textDecoder = new (window as any).TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = "";

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
                  } catch (e) {
                    // ignore non-json serial logs
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("Serial read loop error:", err);
        } finally {
          setSerialConnected(false);
        }
      })();
    } catch (err) {
      console.error("Serial connection failed:", err);
    }
  };

  // Auto-cycle simulation
  useEffect(() => {
    if (!autoSimulate) return;

    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % 40;
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

  const isDanger =
    telemetry.safety_status === "WARNING" || telemetry.distance_mm < 100;
  const isCaution =
    telemetry.safety_status === "CAUTION" ||
    (telemetry.distance_mm >= 100 && telemetry.distance_mm <= 200);
  const isFogAlert = telemetry.fog_status.includes("FOG");

  const safetyColor = isDanger
    ? "border-red-500/60 bg-red-950/40 text-red-200 shadow-xl shadow-red-900/40"
    : isCaution
    ? "border-amber-500/60 bg-amber-950/40 text-amber-200 shadow-xl shadow-amber-900/40"
    : "border-emerald-500/60 bg-emerald-950/40 text-emerald-200 shadow-xl shadow-emerald-900/40";

  return (
    <div className="glass-panel rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* HEADER WITH CONTROLS */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-cyan-400 text-base">📡</span>
          <div>
            <h3 className="font-mono text-xs sm:text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
              <span>ESP32 Sensor Mesh & Radar</span>
              <span className="glass-pill px-2 py-0.5 rounded-full text-[10px] text-cyan-300 font-normal">
                ESP-NOW 2.4GHz
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          {/* WebSerial Connect */}
          {serialSupported && (
            <button
              type="button"
              onClick={handleConnectSerial}
              className={`px-3 py-1 rounded-xl border transition-all flex items-center gap-1.5 ${
                serialConnected
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow"
                  : "glass-pill text-cyan-200 hover:text-white"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  serialConnected
                    ? "bg-emerald-400 animate-ping"
                    : "bg-cyan-400/50"
                }`}
              />
              <span>{serialConnected ? "ESP32 LINKED" : "CONNECT USB"}</span>
            </button>
          )}

          {/* Simulator Toggle */}
          <button
            type="button"
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-3 py-1 rounded-xl border transition-all ${
              isSimulating
                ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow"
                : "glass-pill text-white/70 hover:text-white"
            }`}
          >
            🎛️ {isSimulating ? "SIMULATOR ON" : "SIMULATE"}
          </button>
        </div>
      </div>

      {/* DYNAMIC COLLISION BANNER */}
      <div
        className={`rounded-xl border p-3.5 backdrop-blur-md transition-all duration-300 flex items-center justify-between gap-3 ${safetyColor}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl animate-bounce">
            {isDanger ? "🚨" : isCaution ? "⚠️" : "🛡️"}
          </span>
          <div>
            <div className="flex items-center gap-2 font-mono">
              <span className="font-bold text-sm uppercase">
                STATUS: {telemetry.safety_status}
              </span>
              {isDanger && (
                <span className="px-1.5 py-0.2 text-[10px] bg-red-600 text-white font-bold rounded animate-pulse">
                  BRAKE NOW
                </span>
              )}
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {isDanger
                ? "COLLISION WARNING: Distance < 100mm threshold!"
                : isCaution
                ? "CAUTION DISTANCE: Object approaching (100-200mm zone)."
                : "Safe clearance maintained along haul route."}
            </p>
          </div>
        </div>

        <div className="text-right font-mono text-xs">
          <span className="text-[10px] opacity-60 uppercase">PROXIMITY</span>
          <div className="font-bold text-white">
            {telemetry.proximity} ({telemetry.rssi} dBm)
          </div>
        </div>
      </div>

      {/* CORE SENSOR GAUGES GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* CARD 1: VL53L0X ToF RADAR */}
        <div className="glass-panel-subtle rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono border-b border-white/10 pb-2">
            <span className="text-white/70">ToF LASER RADAR</span>
            <span className="text-cyan-300">0-2000mm</span>
          </div>

          <div className="py-3 flex flex-col items-center">
            {/* Radar Arc */}
            <div className="relative w-40 h-20 flex items-center justify-center overflow-hidden">
              <div className="absolute top-0 w-40 h-40 rounded-full border-2 border-dashed border-white/20" />
              <div
                className={`absolute top-0 w-40 h-40 rounded-full border-4 transition-all duration-300 ${
                  isDanger
                    ? "border-red-400 shadow-lg shadow-red-500/50"
                    : isCaution
                    ? "border-amber-400 shadow-lg shadow-amber-500/50"
                    : "border-emerald-400 shadow-lg shadow-emerald-500/50"
                }`}
                style={{
                  clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
                  transform: `rotate(${Math.min(
                    180,
                    (telemetry.distance_mm / 600) * 180
                  )}deg)`,
                }}
              />
              <div className="text-center z-10 pt-3">
                <span className="font-mono text-2xl sm:text-3xl font-black text-white">
                  {telemetry.distance_mm >= 9999 ? "--" : telemetry.distance_mm}
                </span>
                <span className="text-[11px] text-white/50 ml-1">mm</span>
                <div className="text-[10px] font-mono text-white/60">
                  ({(telemetry.distance_mm / 10).toFixed(1)} cm)
                </div>
              </div>
            </div>

            {/* Linear Bar */}
            <div className="w-full mt-2">
              <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden relative border border-white/10">
                <div
                  className={`h-full transition-all duration-300 ${
                    isDanger
                      ? "bg-red-500"
                      : isCaution
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (telemetry.distance_mm / 600) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono">
            <span className="text-white/60">IR Beam Sensor:</span>
            <span
              className={`px-1.5 py-0.5 rounded ${
                telemetry.object_detected
                  ? "bg-red-500/30 text-red-300 border border-red-500/50"
                  : "bg-white/10 text-white/60"
              }`}
            >
              {telemetry.object_detected ? "OBJECT DETECTED" : "CLEAR"}
            </span>
          </div>
        </div>

        {/* CARD 2: ATMOSPHERIC & FOG HEURISTIC */}
        <div className="glass-panel-subtle rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono border-b border-white/10 pb-2">
            <span className="text-white/70">ATMOSPHERIC SENSORS</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isFogAlert
                  ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 animate-pulse"
                  : "bg-emerald-500/30 text-emerald-300 border border-emerald-500/50"
              }`}
            >
              {telemetry.fog_status}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-3 text-center font-mono">
            <div className="bg-black/30 rounded-lg p-2 border border-white/5">
              <span className="text-[10px] text-white/50 block">Humidity</span>
              <span
                className={`text-lg font-bold ${
                  telemetry.humidity >= 75 ? "text-cyan-300" : "text-white"
                }`}
              >
                {Math.round(telemetry.humidity)}%
              </span>
              <span className="text-[9px] text-white/40 block">&ge;75% fog</span>
            </div>

            <div className="bg-black/30 rounded-lg p-2 border border-white/5">
              <span className="text-[10px] text-white/50 block">Light</span>
              <span
                className={`text-lg font-bold ${
                  telemetry.ambient_light <= 100
                    ? "text-amber-300"
                    : "text-white"
                }`}
              >
                {Math.round(telemetry.ambient_light)}
              </span>
              <span className="text-[9px] text-white/40 block">&le;100 Lux</span>
            </div>

            <div className="bg-black/30 rounded-lg p-2 border border-white/5">
              <span className="text-[10px] text-white/50 block">Temp</span>
              <span className="text-lg font-bold text-white">
                {telemetry.temperature.toFixed(1)}°
              </span>
              <span className="text-[9px] text-white/40 block">DHT22</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-white/60">
            <span>Fog Heuristic:</span>
            <span
              className={
                isFogAlert ? "text-amber-300 font-bold" : "text-emerald-300"
              }
            >
              {isFogAlert ? "⚡ Fog Protocol Engaged" : "✓ Clear Pit Air"}
            </span>
          </div>
        </div>
      </div>

      {/* INTERACTIVE SIMULATOR (DRAWER) */}
      {isSimulating && (
        <div className="glass-panel-subtle rounded-xl p-4 border border-cyan-400/30 text-xs font-mono flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-cyan-300 font-bold flex items-center gap-1.5">
              <span>🎛️</span> HARDWARE TELEMETRY CONTROLS
            </span>
            <label className="flex items-center gap-2 cursor-pointer text-white/80">
              <input
                type="checkbox"
                checked={autoSimulate}
                onChange={(e) => setAutoSimulate(e.target.checked)}
                className="rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-0"
              />
              <span>Auto-Cycle Approach Demo</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-white/60">Distance (mm):</span>
                <span className="text-white font-bold">
                  {telemetry.distance_mm} mm
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="700"
                step="5"
                value={telemetry.distance_mm}
                onChange={(e) =>
                  updateTelemetryValues({ distance_mm: Number(e.target.value) })
                }
                className="w-full accent-cyan-400"
              />
              <div className="flex gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ distance_mm: 70 })}
                  className="px-2 py-0.5 rounded bg-red-950/60 border border-red-700/60 text-red-200 text-[10px]"
                >
                  70mm Warn
                </button>
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ distance_mm: 160 })}
                  className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/60 text-amber-200 text-[10px]"
                >
                  160mm Caution
                </button>
                <button
                  type="button"
                  onClick={() => updateTelemetryValues({ distance_mm: 500 })}
                  className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-[10px]"
                >
                  500mm Safe
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-white/60">Humidity (%):</span>
                <span className="text-white font-bold">
                  {Math.round(telemetry.humidity)}%
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="98"
                step="1"
                value={telemetry.humidity}
                onChange={(e) =>
                  updateTelemetryValues({ humidity: Number(e.target.value) })
                }
                className="w-full accent-blue-400"
              />
              <span className="text-[10px] text-white/40 block mt-1">
                Rule: &ge;75% triggers fog
              </span>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-white/60">Ambient Light (Lux):</span>
                <span className="text-white font-bold">
                  {Math.round(telemetry.ambient_light)} Lux
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="800"
                step="5"
                value={telemetry.ambient_light}
                onChange={(e) =>
                  updateTelemetryValues({
                    ambient_light: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-400"
              />
              <span className="text-[10px] text-white/40 block mt-1">
                Rule: &le;100 Lux triggers fog
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
