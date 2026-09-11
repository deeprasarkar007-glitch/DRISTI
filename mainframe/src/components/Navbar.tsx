import { useState } from "react";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = ["Labs", "Studio", "Openings", "Shop"];

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-10 w-full px-5 sm:px-8 py-4 sm:py-5 flex justify-between items-center">
        {/* LOGO (LEFT) */}
        <div className="flex items-center gap-3">
          <span
            className="text-[21px] sm:text-[26px] tracking-tight text-black select-none"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Mainframe®
          </span>
          <span
            className="text-[25px] sm:text-[30px] text-black select-none inline-block leading-none"
            style={{ letterSpacing: "-0.02em" }}
          >
            ✳︎
          </span>
        </div>

        {/* DESKTOP NAV LINKS (CENTER, HIDDEN BELOW MD) */}
        <nav className="hidden md:flex items-center text-[23px] text-black">
          {links.map((link, idx) => (
            <span key={link} className="flex items-center">
              <a
                href={`#${link.toLowerCase()}`}
                className="hover:opacity-60 transition-opacity"
              >
                {link}
              </a>
              {idx < links.length - 1 && <span>,&nbsp;</span>}
            </span>
          ))}
        </nav>

        {/* DESKTOP CTA (RIGHT, HIDDEN BELOW MD) */}
        <div className="hidden md:block">
          <a
            href="mailto:hello@mainframe.co"
            className="text-[23px] text-black underline underline-offset-2 hover:opacity-60 transition-opacity"
          >
            Get in touch
          </a>
        </div>

        {/* MOBILE HAMBURGER (VISIBLE BELOW MD) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex flex-col justify-center items-center gap-[5px] p-2 focus:outline-none z-20"
          aria-label="Toggle navigation menu"
        >
          <span
            className={`w-6 h-[2px] bg-black transition-all duration-300 transform origin-center ${
              mobileMenuOpen ? "rotate-45 translate-y-[7px]" : ""
            }`}
          />
          <span
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              mobileMenuOpen ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`w-6 h-[2px] bg-black transition-all duration-300 transform origin-center ${
              mobileMenuOpen ? "-rotate-45 -translate-y-[7px]" : ""
            }`}
          />
        </button>
      </header>

      {/* MOBILE OVERLAY (Z-INDEX: 9) */}
      <div
        className={`fixed inset-0 z-[9] bg-white/95 backdrop-blur-sm flex flex-col justify-center px-8 gap-8 md:hidden transition-opacity duration-300 ${
          mobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col gap-8">
          {links.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              onClick={() => setMobileMenuOpen(false)}
              className="text-[32px] font-medium text-black hover:opacity-60 transition-opacity"
            >
              {link}
            </a>
          ))}
          <a
            href="mailto:hello@mainframe.co"
            onClick={() => setMobileMenuOpen(false)}
            className="text-[32px] font-medium text-black underline underline-offset-4 hover:opacity-60 transition-opacity mt-4"
          >
            Get in touch
          </a>
        </div>
      </div>
    </>
  );
}
