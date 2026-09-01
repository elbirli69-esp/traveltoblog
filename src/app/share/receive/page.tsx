import { Suspense } from "react";
import ShareReceivePage from "@/components/ShareReceivePage";

export default function ShareReceiveRoute() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-10">
          <p className="text-fg-secondary">Recibiendo fotos…</p>
        </main>
      }
    >
      <ShareReceivePage />
    </Suspense>
  );
}
