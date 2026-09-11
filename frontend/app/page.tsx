import WebcamDetector from "@/components/WebcamDetector";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center gap-8 px-4 py-12">
      <div className="text-center max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight">
          🚛 Dumper Truck Detector
        </h1>
        <p className="mt-2 text-slate-400">
          Watches your webcam feed and reports whether a dumper truck is
          currently visible.
        </p>
      </div>

      <WebcamDetector />
    </main>
  );
}
