import type { Metadata, Viewport } from "next";

import { MotionProvider } from "@/components/motion-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Transfer", template: "%s · Transfer" },
  description: "Private file transfer.",
  // Transfer links are unguessable; keep them out of search engines too.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#F4F4F1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-fg font-sans">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
