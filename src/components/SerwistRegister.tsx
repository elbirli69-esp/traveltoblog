"use client";

export default function SerwistProvider() {
  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    process.env.NODE_ENV === "production"
  ) {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  }
  return null;
}
