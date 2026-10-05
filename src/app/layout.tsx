import type { Metadata, Viewport } from "next";

import { MotionProvider } from "@/components/motion-provider";
import { PageTransition } from "@/components/page-transition";

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
    <html lang="en" suppressHydrationWarning>
      {/* Browser extensions add attributes to <body>; that is not a real mismatch. */}
      <body className="min-h-dvh bg-bg text-fg font-sans" suppressHydrationWarning>
        <MotionProvider>
          <PageTransition>{children}</PageTransition>
        </MotionProvider>
        <div className="intro-curtain" aria-hidden="true" />
      </body>
    </html>
  );
}
