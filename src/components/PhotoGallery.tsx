"use client";

import { useEffect, useMemo, useState } from "react";
import EditableNote from "@/components/EditableNote";
import NoteForm from "@/components/NoteForm";
import { findNearby, formatDistanceM, NEARBY_THRESHOLD_M } from "@/lib/geo";

export interface GalleryPhoto {
  id: string;
  url: string;
  exifDateTime: string | null;
  latitude: number | null;
  longitude: number | null;
  selected: boolean;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  user: { alias: string };
  notes: {
    id: string;
    text: string;
    type: string;
    user: { alias: string };
  }[];
}

export interface GalleryPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string;
}

interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  travelId: string;
  userId: string;
  places?: GalleryPlace[];
  onNoteCreated?: () => void;
  /** Expand this photo when set (mapa / Días / sinergias). */
  focusPhotoId?: string | null;
  onOpenPlace?: (placeId: string) => void;
}

function formatPhotoDate(iso: string | null): string {
  if (!iso) return "Sin fecha EXIF";
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PhotoGallery({
  photos,
  travelId,
  userId,
  places = [],
  onNoteCreated,
  focusPhotoId = null,
  onOpenPlace,
}: PhotoGalleryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transportBusy, setTransportBusy] = useState<string | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusPhotoId) return;
    setExpandedId(focusPhotoId);
    const el = document.getElementById(`gallery-photo-${focusPhotoId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusPhotoId]);

  const sortedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => {
        const da = a.exifDateTime ? new Date(a.exifDateTime).getTime() : 0;
        const db = b.exifDateTime ? new Date(b.exifDateTime).getTime() : 0;
        return da - db;
      }),
    [photos]
  );

  const setTransport = async (
    photo: GalleryPhoto,
    type: "start" | "end",
    clear: boolean
  ) => {
    setTransportBusy(photo.id);
    setTransportError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}/boundaries`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId: photo.id,
          type,
          clear,
          exifDateTime: photo.exifDateTime,
        }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar");
      onNoteCreated?.();
    } catch {
      setTransportError("No se pudo marcar Ida/Vuelta");
    } finally {
      setTransportBusy(null);
    }
  };

  if (sortedPhotos.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Aún no hay fotos en el viaje. Sube la primera arriba.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Galería ({sortedPhotos.length})
        </h2>
        <p className="text-xs text-slate-500">Toca una foto para comentar o marcar Ida/Vuelta</p>
      </div>

      {transportError && (
        <p className="text-sm text-red-600">{transportError}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {sortedPhotos.map((photo) => {
          const isExpanded = expandedId === photo.id;
          const photoNotes = photo.notes.filter((n) => n.type === "PHOTO");
          const badges: string[] = [];
          if (photo.isTransportStart) badges.push("Ida");
          if (photo.isTransportEnd) badges.push("Vuelta");
          if (photo.latitude != null && photo.longitude != null) badges.push("GPS");

          const nearby =
            photo.latitude != null && photo.longitude != null
              ? findNearby(
                  { latitude: photo.latitude, longitude: photo.longitude },
                  places,
                  NEARBY_THRESHOLD_M
                )
              : [];

          return (
            <article
              key={photo.id}
              id={`gallery-photo-${photo.id}`}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow ${
                isExpanded
                  ? "border-teal-300 ring-2 ring-teal-500/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : photo.id)}
                className="block w-full text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="space-y-1 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-700">
                      {photo.user.alias}
                    </span>
                    {badges.map((badge) => (
                      <span
                        key={badge}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          badge === "Ida" || badge === "Vuelta"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {badge}
                      </span>
                    ))}
                    {photoNotes.length > 0 && (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                        {photoNotes.length} nota{photoNotes.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {formatPhotoDate(photo.exifDateTime)}
                  </p>
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={transportBusy === photo.id}
                      onClick={() =>
                        setTransport(photo, "start", photo.isTransportStart)
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        photo.isTransportStart
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {photo.isTransportStart ? "Quitar Ida" : "Marcar Ida"}
                    </button>
                    <button
                      type="button"
                      disabled={transportBusy === photo.id}
                      onClick={() =>
                        setTransport(photo, "end", photo.isTransportEnd)
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        photo.isTransportEnd
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {photo.isTransportEnd ? "Quitar Vuelta" : "Marcar Vuelta"}
                    </button>
                  </div>

                  {nearby.length > 0 && onOpenPlace && (
                    <div className="rounded-xl bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                      <p className="mb-1.5 font-semibold">Cerca de un lugar marcado</p>
                      <ul className="space-y-1">
                        {nearby.slice(0, 3).map((place) => (
                          <li key={place.id}>
                            <button
                              type="button"
                              onClick={() => onOpenPlace(place.id)}
                              className="font-medium text-emerald-800 underline-offset-2 hover:underline"
                            >
                              {place.name} ({formatDistanceM(place.distanceM)})
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {photoNotes.length > 0 && (
                    <ul className="space-y-2">
                      {photoNotes.map((note) => (
                        <EditableNote
                          key={note.id}
                          note={note}
                          onChanged={onNoteCreated}
                        />
                      ))}
                    </ul>
                  )}
                  <NoteForm
                    travelId={travelId}
                    userId={userId}
                    photoId={photo.id}
                    type="PHOTO"
                    onCreated={() => {
                      onNoteCreated?.();
                    }}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
