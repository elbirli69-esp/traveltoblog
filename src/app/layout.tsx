import type { Metadata, Viewport } from "next";
import SerwistRegister from "@/components/SerwistRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelToBlog — Diario de viajes colaborativo",
  description:
    "PWA colaborativa para registrar viajes con fotos y notas, y generar crónicas con IA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TravelToBlog",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
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
    <html lang="es">
      <body className="min-h-dvh antialiased">
        <SerwistRegister />
        {children}
      </body>
    </html>
  );
}
