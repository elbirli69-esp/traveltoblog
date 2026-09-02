"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearLocalTravelData } from "@/lib/travel-local-cleanup";

interface DeleteTravelPanelProps {
  travelId: string;
  title: string;
  userId: string;
  creatorId: string | null;
  photoCount: number;
  placeCount: number;
  participantCount: number;
}

export default function DeleteTravelPanel({
  travelId,
  title,
  userId,
  creatorId,
  photoCount,
  placeCount,
  participantCount,
}: DeleteTravelPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!creatorId || creatorId !== userId) {
    return null;
  }

  const titleMatches = confirmTitle.trim() === title.trim();
  const canDelete = titleMatches && acknowledged && !busy;

  const reset = () => {
    setConfirmTitle("");
    setAcknowledged(false);
    setError(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const deleteTravel = async () => {
    if (!canDelete) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, confirmTitle: confirmTitle.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo eliminar el viaje");
      }

      await clearLocalTravelData(travelId);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el viaje");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface border border-[var(--callout-error-border)]">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="font-semibold text-[var(--callout-error-fg)]">Zona peligrosa</h3>
          <p className="mt-0.5 text-sm text-fg-secondary">
            {open
              ? "Eliminar este viaje de forma permanente"
              : "Solo tú, como creador, puedes borrar este viaje"}
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-semibold text-[var(--callout-error-fg)]"
          aria-hidden="true"
        >
          {open ? "Cancelar" : "Mostrar"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--callout-error-border)] px-5 pb-5 pt-4">
          <div className="callout callout-error text-sm">
            <p className="font-medium">Esta acción no se puede deshacer.</p>
            <p className="mt-2">
              Se eliminarán permanentemente las fotos ({photoCount}), los lugares ({placeCount}),
              las notas, la crónica y los datos de los {participantCount} participante
              {participantCount !== 1 ? "s" : ""}.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <span>
              Entiendo que se borrarán todos los recuerdos de este viaje para todos los
              participantes.
            </span>
          </label>

          <div>
            <label htmlFor="delete-travel-confirm" className="mb-1 block text-sm text-fg-secondary">
              Escribe el título exacto del viaje para confirmar:{" "}
              <span className="font-medium text-fg">&ldquo;{title}&rdquo;</span>
            </label>
            <input
              id="delete-travel-confirm"
              type="text"
              value={confirmTitle}
              onChange={(e) => setConfirmTitle(e.target.value)}
              placeholder={title}
              className="w-full rounded-lg border border-divider bg-[var(--surface-inset)] px-3 py-2 text-sm text-fg"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="button"
            onClick={deleteTravel}
            disabled={!canDelete}
            className="w-full rounded-lg border border-[var(--callout-error-border)] bg-[var(--callout-error-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--callout-error-fg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Eliminando viaje…" : "Eliminar viaje permanentemente"}
          </button>
        </div>
      )}
    </section>
  );
}
