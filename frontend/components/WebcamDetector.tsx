"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API_URL =  "http://127.0.0.1:8000";
const CAPTURE_INTERVAL_MS = 800;
const JPEG_QUALITY = 0.8;

type PredictionResult = {
  detected: boolean;
  label: string;
  confidence: number;
  raw_score: number;
};

type Status =
  | { kind: "starting_camera" }
  | { kind: "camera_error"; message: string }
  | { kind: "waiting_for_backend" }
  | { kind: "backend_error"; message: string }
  | { kind: "model_not_ready" }
  | { kind: "ready"; result: PredictionResult };

export default function WebcamDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inFlightRef = useRef(false);

  const [status, setStatus] = useState<Status>({ kind: "starting_camera" });

  // Start the webcam once, on mount.
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
    if (inFlightRef.current) return; // don't overlap requests

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        inFlightRef.current = true;
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
                ? `Can't reach the backend at ${API_URL} (${err.message}). Is it running?`
                : `Can't reach the backend at ${API_URL}. Is it running?`,
          });
        } finally {
          inFlightRef.current = false;
        }
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  }, []);

  useEffect(() => {
    const interval = setInterval(captureAndSend, CAPTURE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [captureAndSend]);

  return (
    <div className="w-full max-w-2xl flex flex-col items-center gap-6">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-700 bg-black shadow-lg">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {status.kind === "starting_camera" && (
          <Overlay text="Requesting camera access..." />
        )}
        {status.kind === "camera_error" && (
          <Overlay text={`Camera error: ${status.message}`} isError />
        )}
      </div>

      {/* Hidden canvas used only to grab frames for upload */}
      <canvas ref={canvasRef} className="hidden" />

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
    return (
      <Card tone="neutral" title="Connecting to backend..." />
    );
  }

  if (status.kind === "model_not_ready") {
    return (
      <Card
        tone="warning"
        title="Model not trained yet"
        subtitle="Run the training notebook, then restart the backend so it picks up the saved model."
      />
    );
  }

  if (status.kind === "backend_error") {
    return <Card tone="error" title="Backend unreachable" subtitle={status.message} />;
  }

  const { result } = status;
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <Card
      tone={result.detected ? "positive" : "neutral"}
      title={
        result.detected
          ? "🚛 Dumper truck detected"
          : "No dumper truck detected"
      }
      subtitle={`Confidence: ${confidencePct}% (label: ${result.label})`}
    >
      <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden mt-3">
        <div
          className={`h-full ${result.detected ? "bg-emerald-500" : "bg-slate-500"}`}
          style={{ width: `${confidencePct}%` }}
        />
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
    neutral: "border-slate-700 bg-slate-800/60",
    positive: "border-emerald-600 bg-emerald-950/40",
    warning: "border-amber-600 bg-amber-950/40",
    error: "border-red-600 bg-red-950/40",
  };

  return (
    <div
      className={`w-full rounded-xl border px-6 py-4 ${toneClasses[tone]}`}
    >
      <p className="text-lg font-semibold">{title}</p>
      {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      {children}
    </div>
  );
}

