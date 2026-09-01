"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSessionFromStorage } from "@/lib/utils";
import { storePendingShareId } from "@/lib/share-client";

export default function ShareReceivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Recibiendo fotos compartidas…");

  useEffect(() => {
    const error = searchParams.get("error");
    const bundleId = searchParams.get("id");

    if (error === "no-files") {
      setMessage("No se recibieron imágenes. Prueba compartir una foto desde la galería.");
      return;
    }
    if (error === "invalid" || !bundleId) {
      setMessage("No se pudieron procesar las fotos compartidas.");
      return;
    }

    const session = getSessionFromStorage();
    if (session) {
      router.replace(`/travel/${session.travelId}?shared=${encodeURIComponent(bundleId)}`);
      return;
    }

    storePendingShareId(bundleId);
    setMessage("Fotos recibidas. Elige o crea un viaje para añadirlas.");
  }, [router, searchParams]);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-fg">Compartir a TravelToBlog</h1>
      <p className="mb-6 text-sm text-fg-secondary">{message}</p>
      <div className="space-y-3">
        <Link
          href="/"
          className="btn-primary block w-full py-3 text-center text-sm"
        >
          Ir al inicio
        </Link>
        <Link
          href="/join"
          className="btn-secondary block w-full py-3 text-center text-sm"
        >
          Unirme a un viaje
        </Link>
      </div>
    </main>
  );
}
