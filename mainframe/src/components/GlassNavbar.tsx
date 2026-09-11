import { useEffect, useState } from "react";

interface GlassNavbarProps {
  threatLevel: "CRITICAL" | "HIGH" | "CAUTION" | "SECURE";
  viewMode: "unified" | "vision" | "telemetry";
  onViewModeChange: (mode: "unified" | "vision" | "telemetry") => void;
  buzzerEnabled: boolean;
  onToggleBuzzer: () => void;
}

export default function GlassNavbar({
  threatLevel,
  viewMode,
  onViewModeChange,
  buzzerEnabled,
  onToggleBuzzer,
}: GlassNavbarProps) {
  const [timeStr, setTimeStr] = useState<string>("");
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  // Real-time clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-GB") +
          "." +
          String(now.getMilliseconds()).padStart(3, "0").slice(0, 2)
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, []);

  // Health ping to backend
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/health");
        if (!cancelled) setBackendOk(res.ok);
      } catch {
        if (!cancelled) setBackendOk(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const threatColor =
    threatLevel === "CRITICAL"
      ? "bg-red-500/20 text-red-300 border-red-500/60 shadow-lg shadow-red-500/30 animate-pulse"
      : threatLevel === "HIGH"
      ? "bg-orange-500/20 text-orange-300 border-orange-500/60 shadow-lg shadow-orange-500/20"
      : threatLevel === "CAUTION"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-lg shadow-amber-500/20"
      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-lg shadow-emerald-500/20";

  return (
    <header className="fixed top-4 inset-x-4 z-20 max-w-7xl mx-auto">
      <div className="glass-panel rounded-2xl px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* BRAND & ZONE */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-xl shadow-inner">
            👁️
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="font-bold text-lg sm:text-xl tracking-tight text-white select-none"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                DRISTI
              </span>
              <span className="text-white/40 font-light">|</span>
              <span
                className="text-sm tracking-tight text-white/90 select-none hidden sm:inline"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Mainframe®
              </span>
              <span className="text-xs text-white/50 select-none">✳︎</span>
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full">
                Zone A3
              </span>
            </div>
            <p className="text-[11px] text-white/60">
              Mine Haulage Safety & Low-Visibility Anti-Collision
            </p>
          </div>
        </div>

        {/* CONTROLS, THREAT LEVEL & STATUS */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs font-mono">
          {/* Layout Switcher */}
          <div className="glass-pill rounded-xl p-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onViewModeChange("unified")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "unified"
                  ? "bg-white/25 text-white shadow font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Cockpit
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("vision")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "vision"
                  ? "bg-white/25 text-white shadow font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Vision
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("telemetry")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "telemetry"
                  ? "bg-white/25 text-white shadow font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Radar
            </button>
          </div>

          {/* Buzzer Button */}
          <button
            type="button"
            onClick={onToggleBuzzer}
            className={`px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
              buzzerEnabled
                ? "bg-amber-500/20 border-amber-400/40 text-amber-200 shadow-sm"
                : "glass-pill text-white/50 hover:text-white"
            }`}
          >
            <span>{buzzerEnabled ? "🔊" : "🔇"}</span>
            <span className="hidden sm:inline">
              {buzzerEnabled ? "BUZZER: ON" : "MUTED"}
            </span>
          </button>

          {/* Backend API Ping */}
          <div className="glass-pill px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-white/70">
            <span
              className={`w-2 h-2 rounded-full ${
                backendOk
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                  : backendOk === false
                  ? "bg-red-400"
                  : "bg-amber-400 animate-ping"
              }`}
            />
            <span className="text-[11px] hidden md:inline">
              {backendOk ? "API: ONLINE" : "API: OFFLINE"}
            </span>
          </div>

          {/* Threat Pill */}
          <div className={`px-3 py-1.5 rounded-xl border font-bold ${threatColor}`}>
            THREAT: {threatLevel}
          </div>

          {/* Clock */}
          <div className="hidden lg:block text-right text-[11px] text-white/60 font-mono pl-1">
            <div className="text-white font-medium">{timeStr}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
