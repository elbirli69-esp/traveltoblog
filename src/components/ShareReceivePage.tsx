"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getSessionFromStorage,
  saveSession,
  type TravelHistoryEntry,
} from "@/lib/utils";
import {
  clearPendingShareId,
  discardSharedBundle,
  peekPendingShareId,
  storePendingShareId,
  travelUrlWithShare,
} from "@/lib/share-client";
import { pruneDeletedTravelHistory } from "@/lib/travel-local-cleanup";

export default function ShareReceivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Recibiendo fotos compartidas…");
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [history, setHistory] = useState<TravelHistoryEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const error = searchParams.get("error");
    const id = searchParams.get("id") ?? peekPendingShareId();

    if (error === "no-files") {
      setMessage("No se recibieron imágenes. Prueba compartir una foto desde la galería.");
      return;
    }
    if (error === "invalid" || !id) {
      setMessage("No se pudieron procesar las fotos compartidas.");
      return;
    }

    storePendingShareId(id);
    setBundleId(id);

    const session = getSessionFromStorage();
    if (session) {
      router.replace(travelUrlWithShare(session.travelId, id));
      return;
    }

    setMessage("Fotos recibidas. Elige un viaje para añadirlas.");

    void (async () => {
      const pruned = await pruneDeletedTravelHistory();
      setHistory(pruned);
      try {
        const res = await fetch(`/api/share-target/${id}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { bundle?: { files?: unknown[] } };
          setFileCount(data.bundle?.files?.length ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [router, searchParams]);

  const addToTravel = (entry: TravelHistoryEntry) => {
    if (!bundleId) return;
    setBusyId(entry.travelId);
    saveSession({
      userId: entry.userId,
      alias: entry.alias,
      travelId: entry.travelId,
    });
    router.push(travelUrlWithShare(entry.travelId, bundleId));
  };

  const discard = async () => {
    if (bundleId) await discardSharedBundle(bundleId);
    clearPendingShareId();
    router.replace("/");
  };

  const countLabel =
    fileCount == null
      ? "Fotos listas para el viaje"
      : `${fileCount} foto${fileCount === 1 ? "" : "s"} lista${fileCount === 1 ? "" : "s"} para añadir`;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-fg">Compartir a TravelToBlog</h1>
      <p className="mb-2 text-sm text-fg-secondary">{message}</p>
      {bundleId && !searchParams.get("error") && (
        <p className="mb-6 text-sm font-medium text-accent-cyan">{countLabel}</p>
      )}

      {history.length > 0 && bundleId && (
        <section className="surface mb-6 p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">Añadir a un viaje de este dispositivo</h2>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.travelId}>
                <button
                  type="button"
                  onClick={() => addToTravel(entry)}
                  disabled={busyId !== null}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3 text-left disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{entry.title}</span>
                    <span className="block text-xs text-fg-secondary">
                      {entry.alias} · {entry.shareCode}
                    </span>
                  </span>
                  <span className="btn-primary shrink-0 px-3 py-1.5 text-xs">
                    {busyId === entry.travelId ? "Abriendo…" : "Añadir aquí"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-3">
        <Link href="/" className="btn-primary block w-full py-3 text-center text-sm">
          Ir al inicio
        </Link>
        <Link href="/join" className="btn-secondary block w-full py-3 text-center text-sm">
          Unirme a otro viaje
        </Link>
        {bundleId && !searchParams.get("error") && (
          <button
            type="button"
            onClick={() => void discard()}
            className="block w-full py-2 text-center text-xs font-medium text-[var(--callout-error-fg)]"
          >
            Descartar fotos compartidas
          </button>
        )}
      </div>
    </main>
  );
}
