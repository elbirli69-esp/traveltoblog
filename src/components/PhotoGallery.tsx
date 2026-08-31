"use client";

import { useMemo, useState } from "react";
import EditableNote from "@/components/EditableNote";
import NoteForm from "@/components/NoteForm";

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

interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  travelId: string;
  userId: string;
  onNoteCreated?: () => void;
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
  onNoteCreated,
}: PhotoGalleryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => {
        const da = a.exifDateTime ? new Date(a.exifDateTime).getTime() : 0;
        const db = b.exifDateTime ? new Date(b.exifDateTime).getTime() : 0;
        return da - db;
      }),
    [photos]
  );

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
        <p className="text-xs text-slate-500">Toca una foto para comentar</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sortedPhotos.map((photo) => {
          const isExpanded = expandedId === photo.id;
          const photoNotes = photo.notes.filter((n) => n.type === "PHOTO");
          const badges: string[] = [];
          if (photo.isTransportStart) badges.push("Ida");
          if (photo.isTransportEnd) badges.push("Vuelta");
          if (photo.latitude != null && photo.longitude != null) badges.push("GPS");

          return (
            <article
              key={photo.id}
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
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600"
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
