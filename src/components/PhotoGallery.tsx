"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EditableNote from "@/components/EditableNote";
import EmptyMemoryState from "@/components/EmptyMemoryState";
import NoteForm from "@/components/NoteForm";
import MemoryDateTimeField, {
  dateTimeToIso,
  isoToDateAndTime,
} from "@/components/MemoryDateTimeField";
import PaginationBar from "@/components/PaginationBar";
import HighlightScoreControl from "@/components/HighlightScoreControl";
import PhotoImage from "@/components/PhotoImage";
import { findNearby, formatDistanceM, NEARBY_THRESHOLD_M } from "@/lib/geo";
import { isValidGps } from "@/lib/exif";
import { PHOTOS_PAGE_SIZE } from "@/lib/pagination";
import { todayKey } from "@/lib/travel-dates";

export interface GalleryPhoto {
  id: string;
  url: string;
  exifDateTime: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId?: string | null;
  mediaType?: "IMAGE" | "VIDEO";
  durationMs?: number | null;
  selected: boolean;
  highlightScore?: number;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  user: { alias: string };
  place?: { id: string; name: string; type: string } | null;
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
  highlightScore?: number;
}

interface PhotoGalleryProps {
  travelId: string;
  userId: string;
  places?: GalleryPlace[];
  onNoteCreated?: () => void;
  onPhotoDeleted?: () => void;
  focusPhotoId?: string | null;
  onOpenPlace?: (placeId: string) => void;
  onAddPhoto?: () => void;
  /** Increment to reload gallery (tras subir fotos). */
  refreshSignal?: number;
}

function formatPhotoDate(iso: string | null): string {
  if (!iso) return "Sin fecha EXIF";
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }  );
}

function PhotoDateEditor({
  photo,
  onSaved,
}: {
  photo: GalleryPhoto;
  onSaved?: () => void;
}) {
  const initial = isoToDateAndTime(photo.exifDateTime);
  const [date, setDate] = useState(initial.date || todayKey());
  const [time, setTime] = useState(initial.time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const exifDateTime = dateTimeToIso(date, time);
      const res = await fetch(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exifDateTime }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      onSaved?.();
    } catch {
      setError("Error al guardar la fecha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-inset p-3 space-y-2">
      <MemoryDateTimeField
        label="Fecha y hora de la foto"
        date={date}
        time={time}
        onDateChange={setDate}
        onTimeChange={setTime}
        hint={
          photo.exifDateTime
            ? "Corrige la fecha si el EXIF no coincide con el viaje real."
            : "Sin EXIF: indica cuándo se tomó para ordenar el recorrido."
        }
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar fecha"}
      </button>
    </div>
  );
}

export default function PhotoGallery({
  travelId,
  userId,
  places = [],
  onNoteCreated,
  focusPhotoId = null,
  onOpenPlace,
  onAddPhoto,
  onPhotoDeleted,
  refreshSignal = 0,
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transportBusy, setTransportBusy] = useState<string | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const loadPage = useCallback(
    async (nextPage: number, focusId?: string | null) => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PHOTOS_PAGE_SIZE),
        });
        if (focusId) params.set("focusPhotoId", focusId);

        const res = await fetch(`/api/travels/${travelId}/photos?${params}`);
        if (!res.ok) throw new Error("No se pudieron cargar las fotos");
        const data = await res.json();
        setPhotos(data.photos ?? []);
        setPage(data.pagination?.page ?? nextPage);
        setTotal(data.pagination?.total ?? 0);
        setTotalPages(data.pagination?.totalPages ?? 1);
      } catch {
        setLoadError("No se pudieron cargar las fotos");
      } finally {
        setLoading(false);
      }
    },
    [travelId]
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    void loadPage(pageRef.current);
  }, [refreshSignal, loadPage]);

  useEffect(() => {
    if (!focusPhotoId) return;
    void loadPage(page, focusPhotoId).then(() => {
      setExpandedId(focusPhotoId);
      window.setTimeout(() => {
        document
          .getElementById(`gallery-photo-${focusPhotoId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to focusPhotoId changes
  }, [focusPhotoId]);

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

  const deletePhoto = async (photo: GalleryPhoto) => {
    const ok = window.confirm(
      "¿Eliminar esta foto del viaje? Esta acción no se puede deshacer."
    );
    if (!ok) return;

    setDeleteBusy(photo.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      if (expandedId === photo.id) setExpandedId(null);
      onPhotoDeleted?.();
      await loadPage(photos.length === 1 && page > 1 ? page - 1 : page);
    } catch {
      setDeleteError("No se pudo eliminar la foto");
    } finally {
      setDeleteBusy(null);
    }
  };

  if (!loading && total === 0 && !loadError) {
    return (
      <EmptyMemoryState
        title="Aún no hay fotos"
        description="Sube la primera desde arriba o usa el botón para abrir el selector."
        actionLabel="Subir foto"
        onAction={onAddPhoto}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg">
          Galería {total > 0 ? `(${total})` : ""}
        </h2>
        <p className="text-xs text-fg-secondary">
          Miniaturas en la app · resolución completa al exportar
        </p>
      </div>

      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {transportError && <p className="text-sm text-danger">{transportError}</p>}
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={PHOTOS_PAGE_SIZE}
        onPageChange={(p) => {
          setExpandedId(null);
          void loadPage(p);
        }}
        itemLabel="fotos"
      />

      {loading ? (
        <p className="py-12 text-center text-sm text-fg-secondary">Cargando fotos…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo) => {
            const isExpanded = expandedId === photo.id;
            const photoNotes = photo.notes.filter((n) => n.type === "PHOTO");
            const badges: string[] = [];
            if (photo.isTransportStart) badges.push("Ida");
            if (photo.isTransportEnd) badges.push("Vuelta");
            if (photo.mediaType === "VIDEO") badges.push("Vídeo");
            if (isValidGps(photo.latitude, photo.longitude)) badges.push("GPS");
            if (photo.placeId) badges.push("Lugar");

            const nearby =
              isValidGps(photo.latitude, photo.longitude)
                ? findNearby(
                    { latitude: photo.latitude!, longitude: photo.longitude! },
                    places,
                    NEARBY_THRESHOLD_M
                  )
                : [];

            return (
              <article
                key={photo.id}
                id={`gallery-photo-${photo.id}`}
                className={`surface overflow-hidden shadow-sm transition-shadow ${
                  isExpanded
                    ? "photo-tile-active"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : photo.id)}
                  className="block w-full text-left"
                >
                  <PhotoImage
                    photoId={photo.id}
                    url={photo.url}
                    variant={isExpanded ? "full" : "thumb"}
                    mediaType={photo.mediaType ?? "IMAGE"}
                    durationMs={photo.durationMs}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="space-y-1 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-fg-secondary">
                        {photo.user.alias}
                      </span>
                      {badges.map((badge) => (
                        <span
                          key={badge}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            badge === "Ida" || badge === "Vuelta"
                              ? "tag-cyan"
                              : "surface-inset px-2 py-0.5 text-fg-secondary"
                          }`}
                        >
                          {badge}
                        </span>
                      ))}
                      {photoNotes.length > 0 && (
                        <span className="tag-mint">
                          {photoNotes.length} nota{photoNotes.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-fg-secondary">
                      {formatPhotoDate(photo.exifDateTime)}
                    </p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-4 border-t border-divider px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {photo.mediaType !== "VIDEO" && (
                        <>
                      <button
                        type="button"
                        disabled={transportBusy === photo.id}
                        onClick={() =>
                          setTransport(photo, "start", photo.isTransportStart)
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          photo.isTransportStart
                            ? "btn-primary px-3 py-1.5"
                            : "btn-secondary px-3 py-1.5"
                        }`}
                      >
                        {photo.isTransportStart ? "Quitar Ida" : "Marcar Ida"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          transportBusy === photo.id || deleteBusy === photo.id
                        }
                        onClick={() =>
                          setTransport(photo, "end", photo.isTransportEnd)
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          photo.isTransportEnd
                            ? "btn-primary px-3 py-1.5"
                            : "btn-secondary px-3 py-1.5"
                        }`}
                      >
                        {photo.isTransportEnd ? "Quitar Vuelta" : "Marcar Vuelta"}
                      </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={
                          deleteBusy === photo.id || transportBusy === photo.id
                        }
                        onClick={() => deletePhoto(photo)}
                        className="callout callout-error px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {deleteBusy === photo.id
                          ? "Eliminando…"
                          : photo.mediaType === "VIDEO"
                            ? "Eliminar vídeo"
                            : "Eliminar foto"}
                      </button>
                    </div>

                    {places.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-fg-secondary">
                          Lugar asociado
                        </label>
                        <select
                          className="form-input form-input-sm w-full"
                          value={photo.placeId ?? ""}
                          onChange={async (e) => {
                            const nextPlaceId = e.target.value || null;
                            try {
                              const res = await fetch(`/api/photos/${photo.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ placeId: nextPlaceId }),
                              });
                              if (!res.ok) throw new Error("fail");
                              onNoteCreated?.();
                            } catch {
                              /* keep UI; next refresh fixes */
                            }
                          }}
                        >
                          <option value="">Sin lugar</option>
                          {places.map((place) => (
                            <option key={place.id} value={place.id}>
                              {place.name}
                            </option>
                          ))}
                        </select>
                        {photo.placeId && onOpenPlace && (
                          <button
                            type="button"
                            onClick={() => onOpenPlace(photo.placeId!)}
                            className="text-xs font-medium text-accent-mint underline-offset-2 hover:underline"
                          >
                            Ver lugar en el mapa
                          </button>
                        )}
                      </div>
                    )}

                    <HighlightScoreControl
                      value={photo.highlightScore ?? 5}
                      onChange={async (highlightScore) => {
                        try {
                          const res = await fetch(`/api/photos/${photo.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ highlightScore }),
                          });
                          if (!res.ok) throw new Error("fail");
                          onNoteCreated?.();
                        } catch {
                          /* refresh on next load */
                        }
                      }}
                    />

                    {nearby.length > 0 && onOpenPlace && !photo.placeId && (
                      <div className="callout callout-success text-xs">
                        <p className="mb-1.5 font-semibold">Cerca de un lugar marcado</p>
                        <ul className="space-y-1">
                          {nearby.slice(0, 3).map((place) => (
                            <li key={place.id} className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenPlace(place.id)}
                                className="font-medium text-accent-mint underline-offset-2 hover:underline"
                              >
                                {place.name} ({formatDistanceM(place.distanceM)})
                              </button>
                              <button
                                type="button"
                                className="chip-btn"
                                onClick={async () => {
                                  const res = await fetch(`/api/photos/${photo.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ placeId: place.id }),
                                  });
                                  if (res.ok) onNoteCreated?.();
                                }}
                              >
                                Asociar
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {nearby.length > 0 && onOpenPlace && photo.placeId && (
                      <div className="callout callout-success text-xs">
                        <p className="mb-1.5 font-semibold">Otros lugares cerca</p>
                        <ul className="space-y-1">
                          {nearby
                            .filter((place) => place.id !== photo.placeId)
                            .slice(0, 2)
                            .map((place) => (
                              <li key={place.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenPlace(place.id)}
                                  className="font-medium text-accent-mint underline-offset-2 hover:underline"
                                >
                                  {place.name} ({formatDistanceM(place.distanceM)})
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    <PhotoDateEditor photo={photo} onSaved={onNoteCreated} />

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
                      onCreated={onNoteCreated}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
