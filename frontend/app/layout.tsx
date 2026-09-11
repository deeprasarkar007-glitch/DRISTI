import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dumper Truck Detector",
  description: "Live webcam detection of dumper trucks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
