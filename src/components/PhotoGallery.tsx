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
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60/80 p-3 space-y-2">
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
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Galería {total > 0 ? `(${total})` : ""}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
          Miniaturas en la app · resolución completa al exportar
        </p>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {transportError && <p className="text-sm text-red-600">{transportError}</p>}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

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
        <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">Cargando fotos…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo) => {
            const isExpanded = expandedId === photo.id;
            const photoNotes = photo.notes.filter((n) => n.type === "PHOTO");
            const badges: string[] = [];
            if (photo.isTransportStart) badges.push("Ida");
            if (photo.isTransportEnd) badges.push("Vuelta");
            if (isValidGps(photo.latitude, photo.longitude)) badges.push("GPS");

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
                className={`overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 shadow-sm dark:shadow-black/20 transition-shadow ${
                  isExpanded
                    ? "border-teal-300 ring-2 ring-teal-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700"
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
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="space-y-1 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {photo.user.alias}
                      </span>
                      {badges.map((badge) => (
                        <span
                          key={badge}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            badge === "Ida" || badge === "Vuelta"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300"
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
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {formatPhotoDate(photo.exifDateTime)}
                    </p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 px-4 py-4">
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
                            : "bg-white dark:bg-slate-900 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
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
                            ? "bg-indigo-600 text-white"
                            : "bg-white dark:bg-slate-900 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                        }`}
                      >
                        {photo.isTransportEnd ? "Quitar Vuelta" : "Marcar Vuelta"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          deleteBusy === photo.id || transportBusy === photo.id
                        }
                        onClick={() => deletePhoto(photo)}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-50"
                      >
                        {deleteBusy === photo.id ? "Eliminando…" : "Eliminar foto"}
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
