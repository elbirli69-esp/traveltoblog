"use client";

import { isCapacitorNative } from "@/lib/capacitor-native";

export default function SerwistProvider() {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    if (isCapacitorNative()) {
      // Service worker breaks Capacitor file URLs (/_capacitor_file_/…) on Android.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => void reg.unregister());
      });
    } else if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }
  return null;
}
