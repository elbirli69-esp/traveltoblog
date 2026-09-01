import type { Metadata, Viewport } from "next";
import Script from "next/script";
import SerwistRegister from "@/components/SerwistRegister";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelToBlog — Diario de viajes colaborativo",
  description:
    "PWA colaborativa para registrar viajes con fotos y notas, y generar crónicas con IA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TravelToBlog",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#05080c" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <SerwistRegister />
          <div className="pointer-events-none fixed right-3 top-3 z-[100] sm:right-4 sm:top-4">
            <div className="pointer-events-auto">
              <ThemeToggle />
            </div>
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
