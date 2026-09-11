import { useEffect, useState } from "react";
import { useTypewriter } from "../hooks/useTypewriter";

const TYPEWRITER_TEXT =
  "Glad you stopped in. Good taste tends to find us. Now, what are we building?";

export default function Hero() {
  const { displayed, done } = useTypewriter(TYPEWRITER_TEXT, 38, 600);
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonsVisible(true);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText("hello@mainframe.co");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  const whitePills = [
    "Pitch us an idea",
    "Come work here",
    "Send a brief hello",
    "See how we operate",
  ];

  return (
    <section className="relative z-[1] w-full h-screen overflow-hidden flex flex-col justify-end pb-12 md:justify-center md:pb-0 px-5 sm:px-8 md:px-10">
      <div className="max-w-xl relative z-10">
        {/* 1. BLURRED INTRO LABEL */}
        <div
          className="pointer-events-none select-none mb-5 sm:mb-6"
          style={{
            fontSize: "clamp(18px, 4vw, 26px)",
            lineHeight: 1.3,
            fontWeight: 400,
            color: "#000",
            filter: "blur(4px)",
          }}
        >
          Hey there, meet A.R.I.A,
          <br />
          Mainframe's Adaptive Response Interface Agent
        </div>

        {/* 2. TYPEWRITER TEXT */}
        <p
          className="text-black mb-5 sm:mb-6 min-h-[54px]"
          style={{
            fontSize: "clamp(18px, 4vw, 26px)",
            lineHeight: 1.35,
            fontWeight: 400,
          }}
        >
          {displayed}
          {!done && (
            <span
              className="inline-block w-[2px] h-[1.1em] bg-black align-middle ml-[2px] animate-blink"
              aria-hidden="true"
            />
          )}
        </p>

        {/* 3. ACTION PILL BUTTONS */}
        <div
          className="flex flex-wrap gap-y-1 transition-all duration-400 ease-out"
          style={{
            opacity: buttonsVisible ? 1 : 0,
            transform: buttonsVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.4s ease, transform 0.4s ease",
          }}
        >
          {whitePills.map((label) => (
            <button
              key={label}
              type="button"
              className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
            >
              {label}
            </button>
          ))}

          {/* 1 OUTLINE PILL BUTTON */}
          <button
            type="button"
            onClick={handleCopyEmail}
            className="group inline-flex items-center justify-center text-white bg-transparent border border-white rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap gap-2 sm:gap-3 hover:bg-white hover:text-black transition-colors duration-200 cursor-pointer"
          >
            <span>
              Reach us:{" "}
              <span className="underline underline-offset-1">
                hello@mainframe.co
              </span>
            </span>
            {copied ? (
              <span className="text-[11px] font-mono text-emerald-300 group-hover:text-emerald-700">
                Copied!
              </span>
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
