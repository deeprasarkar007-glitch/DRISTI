import { useState } from "react";
import BackgroundVideo from "./components/BackgroundVideo";
import GlassNavbar from "./components/GlassNavbar";
import GlassCommandCenter from "./components/GlassCommandCenter";

export default function App() {
  const [viewMode, setViewMode] = useState<"unified" | "vision" | "telemetry">("unified");
  const [threatLevel, setThreatLevel] = useState<"CRITICAL" | "HIGH" | "CAUTION" | "SECURE">("SECURE");
  const [buzzerEnabled, setBuzzerEnabled] = useState(true);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden text-slate-100">
      {/* MOUSE-SCRUBBED INTERACTIVE BACKGROUND VIDEO (Z-INDEX 0) */}
      <BackgroundVideo />

      {/* FLOATING GLASSMORPHIC NAVBAR (Z-INDEX 20) */}
      <GlassNavbar
        threatLevel={threatLevel}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        buzzerEnabled={buzzerEnabled}
        onToggleBuzzer={() => setBuzzerEnabled(!buzzerEnabled)}
      />

      {/* DUAL-PANE GLASSMORPHIC MISSION CONTROL TERMINAL (Z-INDEX 10) */}
      <main className="relative z-10 w-full min-h-screen flex flex-col">
        <GlassCommandCenter
          viewMode={viewMode}
          buzzerEnabled={buzzerEnabled}
          onThreatLevelChange={setThreatLevel}
        />
      </main>
    </div>
  );
}
