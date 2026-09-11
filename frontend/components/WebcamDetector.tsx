"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_URL = rawApiUrl.trim().replace(/[./]+$/, "");
const CAPTURE_INTERVAL_MS = 800;
const JPEG_QUALITY = 0.8;

export type PredictionResult = {
  detected: boolean;
  label: string;
  confidence: number;
  raw_score: number;
};

export type Status =
  | { kind: "starting_camera" }
  | { kind: "camera_error"; message: string }
  | { kind: "waiting_for_backend" }
  | { kind: "backend_error"; message: string }
  | { kind: "model_not_ready" }
  | { kind: "ready"; result: PredictionResult };

interface WebcamDetectorProps {
  onPredictionChange?: (pred: PredictionResult | null) => void;
}

export default function WebcamDetector({ onPredictionChange }: WebcamDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inFlightRef = useRef(false);

  const [status, setStatus] = useState<Status>({ kind: "starting_camera" });
  const [lastFrameTime, setLastFrameTime] = useState<number>(Date.now());
  const [fps, setFps] = useState<string>("1.2");

  // Broadcast prediction result to parent
  useEffect(() => {
    if (status.kind === "ready") {
      onPredictionChange?.(status.result);
    } else {
      onPredictionChange?.(null);
    }
  }, [status, onPredictionChange]);

  // Start the webcam once on mount
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus({ kind: "waiting_for_backend" });
      } catch (err) {
        setStatus({
          kind: "camera_error",
          message:
            err instanceof Error
              ? err.message
              : "Could not access the webcam.",
        });
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < video.HAVE_CURRENT_DATA) return;
    if (inFlightRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        inFlightRef.current = true;
        const now = Date.now();
        const delta = now - lastFrameTime;
        if (delta > 0) {
          setFps((1000 / delta).toFixed(1));
        }
        setLastFrameTime(now);

        try {
          const form = new FormData();
          form.append("frame", blob, "frame.jpg");

          const res = await fetch("/api/predict", {
            method: "POST",
            body: form,
          });

          if (res.status === 503) {
            setStatus({ kind: "model_not_ready" });
            return;
          }
          if (!res.ok) {
            const body = await res.text();
            setStatus({
              kind: "backend_error",
              message: `Backend returned ${res.status}: ${body}`,
            });
            return;
          }

          const result: PredictionResult = await res.json();
          setStatus({ kind: "ready", result });
        } catch (err) {
          setStatus({
            kind: "backend_error",
            message:
              err instanceof Error
                ? `Can't reach backend at ${API_URL} (${err.message})`
                : `Can't reach backend at ${API_URL}`,
          });
        } finally {
          inFlightRef.current = false;
        }
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  }, [lastFrameTime]);

  useEffect(() => {
    const interval = setInterval(captureAndSend, CAPTURE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [captureAndSend]);

  const isTruckDetected = status.kind === "ready" && status.result.detected;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* VIDEO CONTAINER WITH TACTICAL HUD OVERLAY */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-700/80 bg-black shadow-2xl group">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* HUD TOP STATUS STRIP */}
        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 flex items-center justify-between text-[11px] font-mono pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-300 font-bold tracking-wider">AI OPTICAL SENSOR LIVE</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">RATE: {fps} FPS</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-600/50 text-blue-300 text-[10px]">
              FOG-ENHANCE: ACTIVE
            </span>
          </div>
        </div>

        {/* CORNER BRACKETS HUD */}
        <div className="absolute inset-2 pointer-events-none border border-cyan-500/20 rounded-lg">
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
        </div>

        {/* SCANLINE EFFECT */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent h-16 w-full animate-scanline pointer-events-none opacity-40" />

        {/* TARGET ACQUIRED RETICLE (WHEN DUMPER TRUCK DETECTED) */}
        {isTruckDetected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-56 h-44 border-2 border-dashed border-red-500 rounded-lg animate-pulse flex flex-col items-center justify-between p-2 shadow-2xl shadow-red-500/30">
              <div className="w-full flex justify-between text-[9px] font-mono text-red-300 bg-red-950/80 px-1.5 py-0.5 rounded">
                <span>TARGET: DUMPER TRUCK</span>
                <span>LOCK {Math.round(status.result.confidence * 100)}%</span>
              </div>
              {/* Reticle Crosshair */}
              <div className="relative w-8 h-8 flex items-center justify-center">
                <div className="w-8 h-0.5 bg-red-400/80" />
                <div className="h-8 w-0.5 bg-red-400/80 absolute" />
                <div className="w-4 h-4 rounded-full border border-red-400 absolute" />
              </div>
              <div className="text-[10px] font-mono text-red-200 bg-red-900/90 px-2 py-0.5 rounded font-bold">
                ⚠️ VEHICLE IN CAMERA FIELD
              </div>
            </div>
          </div>
        )}

        {/* OVERLAYS FOR CAMERA / BACKEND ERRORS */}
        {status.kind === "starting_camera" && (
          <Overlay text="Initializing optical camera feed..." />
        )}
        {status.kind === "camera_error" && (
          <Overlay text={`Camera error: ${status.message}`} isError />
        )}
      </div>

      {/* Hidden canvas used only to grab frames for upload */}
      <canvas ref={canvasRef} className="hidden" />

      {/* STATUS & CONFIDENCE CARD */}
      <StatusCard status={status} />
    </div>
  );
}

function Overlay({ text, isError }: { text: string; isError?: boolean }) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center text-center px-6 text-sm ${
        isError ? "bg-red-950/80 text-red-200" : "bg-black/60 text-slate-200"
      }`}
    >
      {text}
    </div>
  );
}

function StatusCard({ status }: { status: Status }) {
  if (status.kind === "starting_camera" || status.kind === "camera_error") {
    return null;
  }

  if (status.kind === "waiting_for_backend") {
    return <Card tone="neutral" title="Connecting to DRISTI Backend..." subtitle="Checking /health endpoint..." />;
  }

  if (status.kind === "model_not_ready") {
    return (
      <Card
        tone="warning"
        title="Vision Model Standby"
        subtitle="Backend running without weights. Set DEMO_MODE=true or train the weights notebook."
      />
    );
  }

  if (status.kind === "backend_error") {
    return <Card tone="error" title="Backend Unreachable" subtitle={status.message} />;
  }

  const { result } = status;
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <Card
      tone={result.detected ? "positive" : "neutral"}
      title={
        result.detected
          ? "🚛 Dumper Truck Detected"
          : "Scanning Mine Path — No Vehicle in Optical Feed"
      }
      subtitle={`Classification Confidence: ${confidencePct}% (Label: ${result.label})`}
    >
      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mt-3">
        <div
          className={`h-full transition-all duration-300 ${
            result.detected ? "bg-emerald-500" : "bg-slate-600"
          }`}
          style={{ width: `${confidencePct}%` }}
        />
      </div>
      <div className="flex justify-between items-center text-xs text-slate-400 mt-2 font-mono">
        <span>Raw Vision Score: {result.raw_score.toFixed(3)}</span>
        <span>Threshold: 0.50</span>
      </div>
    </Card>
  );
}

function Card({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: "neutral" | "positive" | "warning" | "error";
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "border-slate-800 bg-slate-900/80 text-slate-200",
    positive: "border-emerald-600/70 bg-emerald-950/30 text-emerald-200 shadow-lg shadow-emerald-950/50",
    warning: "border-amber-600/70 bg-amber-950/30 text-amber-200 shadow-lg shadow-amber-950/50",
    error: "border-red-600/70 bg-red-950/40 text-red-200 shadow-lg shadow-red-950/50",
  };

  return (
    <div className={`w-full rounded-xl border px-5 py-4 ${toneClasses[tone]} backdrop-blur`}>
      <p className="text-base font-bold tracking-wide">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      {children}
    </div>
  );
}

