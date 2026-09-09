import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "TALA — Personal Assistant",
  description: "Your voice-driven daily AI assistant with a custom knowledge base and attitude.",
  applicationName: "TALA",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TALA" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-192.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#04070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh text-slate-100 antialiased selection:bg-cyan-400/30">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
