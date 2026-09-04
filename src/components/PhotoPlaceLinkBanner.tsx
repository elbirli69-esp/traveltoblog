"use client";

import { useMemo, useState } from "react";
import {
  summarizeUnlinkedPhotos,
  type PhotoForPlaceLink,
  type PlaceForLink,
} from "@/lib/photo-place-link";

interface PhotoPlaceLinkBannerProps {
  travelId: string;
  photos: PhotoForPlaceLink[];
  places: PlaceForLink[];
  onChanged?: () => void;
  className?: string;
}

export default function PhotoPlaceLinkBanner({
  travelId,
  photos,
  places,
  onChanged,
  className = "",
}: PhotoPlaceLinkBannerProps) {
  const summary = useMemo(
    () => summarizeUnlinkedPhotos(photos, places),
    [photos, places]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLinked, setLastLinked] = useState<number | null>(null);

  if (!places.length || summary.unlinked === 0) return null;

  const autoLink = async () => {
    setBusy(true);
    setError(null);
    setLastLinked(null);
    try {
      const res = await fetch(`/api/travels/${travelId}/photos/auto-link-places`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("fail");
      const data = (await res.json()) as { linked?: number };
      setLastLinked(data.linked ?? 0);
      onChanged?.();
    } catch {
      setError("No se pudieron vincular las fotos automáticamente.");
    } finally {
      setBusy(false);
    }
  };

  const detailParts: string[] = [];
  if (summary.matchable > 0) {
    detailParts.push(
      `${summary.matchable} cerca de un lugar (≤120 m) se pueden vincular solas`
    );
  }
  if (summary.withGpsFar > 0) {
    detailParts.push(
      `${summary.withGpsFar} con GPS lejos de los lugares (asócialas a mano)`
    );
  }
  if (summary.withoutGps > 0) {
    detailParts.push(
      `${summary.withoutGps} sin GPS (elige el lugar en la foto o desde el lugar)`
    );
  }

  return (
    <div
      className={`rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-fg ${className}`}
      role="status"
    >
      <p className="font-medium text-amber-200">
        {summary.unlinked} foto{summary.unlinked !== 1 ? "s" : ""} sin lugar vinculado
      </p>
      <p className="mt-1 text-fg-secondary">
        {places.length} lugar{places.length !== 1 ? "es" : ""} en el viaje.
        {detailParts.length > 0 ? ` ${detailParts.join(". ")}.` : ""}
      </p>
      {lastLinked != null && lastLinked > 0 && (
        <p className="mt-2 text-xs text-emerald-400">
          Vinculadas {lastLinked} foto{lastLinked !== 1 ? "s" : ""} automáticamente.
        </p>
      )}
      {lastLinked === 0 && (
        <p className="mt-2 text-xs text-fg-secondary">
          No había fotos cercanas a ningún lugar para vincular.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void autoLink()}
        disabled={busy || summary.matchable === 0}
        className="btn-secondary mt-3 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {busy
          ? "Vinculando…"
          : summary.matchable > 0
            ? `Vincular automáticamente (${summary.matchable})`
            : "Sin coincidencias por GPS"}
      </button>
    </div>
  );
}
