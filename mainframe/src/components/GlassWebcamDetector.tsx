import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000";
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

interface GlassWebcamDetectorProps {
  onPredictionChange?: (pred: PredictionResult | null) => void;
}

export default function GlassWebcamDetector({
  onPredictionChange,
}: GlassWebcamDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inFlightRef = useRef(false);

  const [status, setStatus] = useState<Status>({ kind: "starting_camera" });
  const [fps, setFps] = useState<string>("1.2");
  const lastFrameTimeRef = useRef<number>(Date.now());

  // Broadcast to parent
  useEffect(() => {
    if (status.kind === "ready") {
      onPredictionChange?.(status.result);
    } else {
      onPredictionChange?.(null);
    }
  }, [status, onPredictionChange]);

  // Start webcam
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
              : "Camera access unavailable.",
        });
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Frame capture and inference
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
        const delta = now - lastFrameTimeRef.current;
        if (delta > 0) {
          setFps((1000 / delta).toFixed(1));
        }
        lastFrameTimeRef.current = now;

        try {
          const form = new FormData();
          form.append("frame", blob, "frame.jpg");

          const res = await fetch(`${API_URL}/predict`, {
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
              message: `HTTP ${res.status}: ${body}`,
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
                ? `Backend connection failure: ${err.message}`
                : "Cannot reach backend.",
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

  const isTruckDetected = status.kind === "ready" && status.result.detected;

  return (
    <div className="glass-panel rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-blue-400 text-base">📷</span>
          <h3 className="font-mono text-xs sm:text-sm font-bold tracking-wider text-white uppercase">
            AI Optical Vision & Target Classifier
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="glass-pill px-2.5 py-0.5 rounded-full text-[10px] font-mono text-cyan-300">
            FASTAPI CNN
          </span>
        </div>
      </div>

      {/* VIDEO CONTAINER WITH FROSTED HUD */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/20 bg-black/60 shadow-inner group">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* TOP STATUS STRIP */}
        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 flex items-center justify-between text-[11px] font-mono pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-300 font-bold tracking-wider">
              OPTICAL FEED LIVE
            </span>
            <span className="text-white/40">|</span>
            <span className="text-white/80">{fps} FPS</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-cyan-200 text-[10px] backdrop-blur-md">
              CLAHE / HIST-EQ: ON
            </span>
          </div>
        </div>

        {/* CORNER BRACKETS HUD */}
        <div className="absolute inset-2.5 pointer-events-none border border-cyan-400/20 rounded-lg">
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
        </div>

        {/* SCANLINE */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent h-14 w-full animate-scanline pointer-events-none" />

        {/* TARGET RETICLE WHEN DETECTED */}
        {isTruckDetected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-56 h-40 border-2 border-dashed border-red-500 rounded-xl animate-pulse flex flex-col items-center justify-between p-2.5 shadow-2xl shadow-red-500/40 bg-red-950/20 backdrop-blur-sm">
              <div className="w-full flex justify-between text-[9px] font-mono text-red-200 bg-red-950/80 px-2 py-0.5 rounded border border-red-500/50">
                <span>TARGET: DUMPER TRUCK</span>
                <span>LOCK {Math.round(status.result.confidence * 100)}%</span>
              </div>
              <div className="relative w-8 h-8 flex items-center justify-center">
                <div className="w-8 h-0.5 bg-red-400" />
                <div className="h-8 w-0.5 bg-red-400 absolute" />
                <div className="w-4 h-4 rounded-full border border-red-400 absolute" />
              </div>
              <div className="text-[10px] font-mono text-white bg-red-600/90 px-2 py-0.5 rounded font-bold shadow">
                ⚠️ VEHICLE IN OPTICAL PATH
              </div>
            </div>
          </div>
        )}

        {/* OVERLAYS FOR CAMERA STATUS */}
        {status.kind === "starting_camera" && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-sm bg-black/70 text-white/80 backdrop-blur-md">
            Requesting camera access...
          </div>
        )}
        {status.kind === "camera_error" && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-sm bg-red-950/80 text-red-200 backdrop-blur-md">
            Camera error: {status.message}
          </div>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* DETECTION STATUS CARD */}
      <GlassStatusCard status={status} />
    </div>
  );
}

function GlassStatusCard({ status }: { status: Status }) {
  if (status.kind === "starting_camera" || status.kind === "camera_error") {
    return null;
  }

  if (status.kind === "waiting_for_backend") {
    return (
      <div className="glass-panel-subtle rounded-xl p-4 text-xs font-mono text-white/70 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span>Connecting to DRISTI FastAPI backend at {API_URL}...</span>
      </div>
    );
  }

  if (status.kind === "model_not_ready") {
    return (
      <div className="glass-panel-subtle rounded-xl p-4 border border-amber-500/30 text-amber-200 text-xs">
        <p className="font-bold">Vision Model Standby</p>
        <p className="text-[11px] text-amber-300/80 mt-1">
          Backend is running in demo mode or awaiting trained weights.
        </p>
      </div>
    );
  }

  if (status.kind === "backend_error") {
    return (
      <div className="glass-panel-subtle rounded-xl p-4 border border-red-500/40 text-red-200 text-xs">
        <p className="font-bold">Backend Unreachable</p>
        <p className="text-[11px] text-red-300/80 mt-1">{status.message}</p>
      </div>
    );
  }

  const { result } = status;
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <div
      className={`glass-panel-subtle rounded-xl p-4 transition-all duration-300 border ${
        result.detected
          ? "border-red-500/50 bg-red-950/20 text-red-200"
          : "border-white/10 text-white/90"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">
          {result.detected
            ? "🚛 Dumper Truck Detected Ahead"
            : "Scanning Haul Path — Route Clear"}
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-white">
          {confidencePct}% Conf
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden mt-3 border border-white/10">
        <div
          className={`h-full transition-all duration-300 ${
            result.detected
              ? "bg-gradient-to-r from-orange-500 to-red-500 shadow-md shadow-red-500/50"
              : "bg-gradient-to-r from-blue-500 to-emerald-500"
          }`}
          style={{ width: `${confidencePct}%` }}
        />
      </div>

      <div className="flex justify-between items-center text-[11px] text-white/50 mt-2 font-mono">
        <span>Raw Sigmoid Score: {result.raw_score.toFixed(3)}</span>
        <span>Decision Threshold: 0.50</span>
      </div>
    </div>
  );
}
