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
import SuggestPhotoNote from "@/components/SuggestPhotoNote";
import { getSessionFromStorage } from "@/lib/utils";

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

export type AddPlaceFromPhotoPayload = {
  photoId: string;
  latitude: number;
  longitude: number;
  /** EXIF / capture time — seeds “visited at” on the new place. */
  visitedAt?: string | null;
};

interface PhotoGalleryProps {
  travelId: string;
  userId: string;
  places?: GalleryPlace[];
  onNoteCreated?: () => void;
  onPhotoDeleted?: () => void;
  focusPhotoId?: string | null;
  onOpenPlace?: (placeId: string) => void;
  /** Open Lugares with a draft pinned at this photo’s GPS. */
  onAddPlaceFromPhoto?: (payload: AddPlaceFromPhotoPayload) => void;
  onAddPhoto?: () => void;
  /** Increment to reload gallery (tras subir fotos). */
  refreshSignal?: number;
  /** Selected photos without a PHOTO note (from travel payload). */
  unnotedPhotoIds?: string[];
  /** Start with “solo sin nota” filter (deep link). */
  initialUnnotedFilter?: boolean;
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

/** Most recent PHOTO note text on another photo in the current page. */
function lastOtherPhotoNoteText(
  photos: GalleryPhoto[],
  excludePhotoId: string
): string | null {
  for (let i = photos.length - 1; i >= 0; i--) {
    const p = photos[i]!;
    if (p.id === excludePhotoId) continue;
    for (let j = p.notes.length - 1; j >= 0; j--) {
      const n = p.notes[j]!;
      if (n.type === "PHOTO" && n.text.trim()) return n.text.trim();
    }
  }
  return null;
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
  onAddPlaceFromPhoto,
  onAddPhoto,
  onPhotoDeleted,
  refreshSignal = 0,
  unnotedPhotoIds = [],
  initialUnnotedFilter = false,
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
  const [notePrefill, setNotePrefill] = useState<{
    photoId: string;
    text: string;
    nonce: number;
  } | null>(null);
  const [unnotedCursor, setUnnotedCursor] = useState(0);
  const [showUnnotedOnly, setShowUnnotedOnly] = useState(
    Boolean(initialUnnotedFilter)
  );
  const pageRef = useRef(page);
  pageRef.current = page;
  const parentRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);
  const unnotedKickoff = useRef(false);
  const showUnnotedOnlyRef = useRef(showUnnotedOnly);
  showUnnotedOnlyRef.current = showUnnotedOnly;

  /** Soft parent refresh — avoids slamming NAS with full travel reload on every keystroke-save. */
  const scheduleParentRefresh = useCallback(() => {
    if (!onNoteCreated) return;
    if (parentRefreshTimer.current) clearTimeout(parentRefreshTimer.current);
    parentRefreshTimer.current = setTimeout(() => {
      parentRefreshTimer.current = null;
      onNoteCreated();
    }, 1200);
  }, [onNoteCreated]);

  useEffect(() => {
    return () => {
      if (parentRefreshTimer.current) clearTimeout(parentRefreshTimer.current);
    };
  }, []);

  const patchPhotoNotes = useCallback(
    (
      photoId: string,
      updater: (
        notes: GalleryPhoto["notes"]
      ) => GalleryPhoto["notes"]
    ) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, notes: updater(p.notes) } : p
        )
      );
    },
    []
  );

  const loadPage = useCallback(
    async (
      nextPage: number,
      focusId?: string | null,
      opts?: { silent?: boolean }
    ) => {
      // Silent refresh keeps the grid mounted so scroll / expanded photo stay put
      // (e.g. after adding a note — otherwise height collapses to "Cargando…").
      const gen = ++loadGenRef.current;
      if (!opts?.silent) setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PHOTOS_PAGE_SIZE),
        });
        if (focusId) params.set("focusPhotoId", focusId);
        if (showUnnotedOnlyRef.current) params.set("withoutNote", "1");

        const res = await fetch(`/api/travels/${travelId}/photos?${params}`);
        if (!res.ok) throw new Error("No se pudieron cargar las fotos");
        const data = await res.json();
        if (gen !== loadGenRef.current) return;
        setPhotos(data.photos ?? []);
        setPage(data.pagination?.page ?? nextPage);
        setTotal(data.pagination?.total ?? 0);
        setTotalPages(data.pagination?.totalPages ?? 1);
      } catch {
        if (gen !== loadGenRef.current) return;
        setLoadError("No se pudieron cargar las fotos");
      } finally {
        // Always clear loading for the latest request (avoids stuck "Cargando…"
        // if a silent refresh interleaved with a normal one).
        if (gen === loadGenRef.current) setLoading(false);
      }
    },
    [travelId]
  );

  // Keep filter + API query in sync before any focus load (avoids racing to full gallery).
  useEffect(() => {
    if (initialUnnotedFilter) {
      showUnnotedOnlyRef.current = true;
      setShowUnnotedOnly(true);
    } else {
      unnotedKickoff.current = false;
    }
  }, [initialUnnotedFilter]);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage, showUnnotedOnly]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    void loadPage(pageRef.current, null, { silent: true });
  }, [refreshSignal, loadPage]);

  useEffect(() => {
    if (!focusPhotoId) return;
    if (initialUnnotedFilter || showUnnotedOnlyRef.current) {
      showUnnotedOnlyRef.current = true;
      setShowUnnotedOnly(true);
    }
    void loadPage(pageRef.current, focusPhotoId).then(() => {
      setExpandedId(focusPhotoId);
      window.setTimeout(() => {
        document
          .getElementById(`gallery-photo-${focusPhotoId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to focusPhotoId changes
  }, [focusPhotoId]);

  const focusUnnotedAt = useCallback(
    (index: number) => {
      if (unnotedPhotoIds.length === 0) return;
      const i = ((index % unnotedPhotoIds.length) + unnotedPhotoIds.length) %
        unnotedPhotoIds.length;
      const id = unnotedPhotoIds[i]!;
      setUnnotedCursor(i);
      showUnnotedOnlyRef.current = true;
      setShowUnnotedOnly(true);
      void loadPage(1, id).then(() => {
        setExpandedId(id);
        window.setTimeout(() => {
          document
            .getElementById(`gallery-photo-${id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      });
    },
    [unnotedPhotoIds, loadPage]
  );

  useEffect(() => {
    if (!initialUnnotedFilter || unnotedKickoff.current) return;
    if (unnotedPhotoIds.length === 0) return;
    unnotedKickoff.current = true;
    const preferred =
      focusPhotoId && unnotedPhotoIds.includes(focusPhotoId)
        ? focusPhotoId
        : unnotedPhotoIds[0]!;
    const idx = unnotedPhotoIds.indexOf(preferred);
    focusUnnotedAt(idx >= 0 ? idx : 0);
  }, [initialUnnotedFilter, unnotedPhotoIds, focusUnnotedAt, focusPhotoId]);

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

  const applyPlaceLink = async (
    photo: GalleryPhoto,
    nextPlaceId: string | null
  ) => {
    const placeMeta =
      nextPlaceId != null
        ? places.find((p) => p.id === nextPlaceId) ?? null
        : null;
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photo.id
          ? {
              ...p,
              placeId: nextPlaceId,
              place: placeMeta
                ? {
                    id: placeMeta.id,
                    name: placeMeta.name,
                    type: placeMeta.type,
                  }
                : null,
            }
          : p
      )
    );
    try {
      const res = await fetch(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: nextPlaceId }),
      });
      if (!res.ok) throw new Error("fail");
      onNoteCreated?.();
    } catch {
      await loadPage(pageRef.current);
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

      {unnotedPhotoIds.length > 0 && (
        <div className="callout callout-warning flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {unnotedPhotoIds.length} foto
            {unnotedPhotoIds.length === 1 ? "" : "s"} sin{" "}
            <strong className="font-semibold">nota de texto</strong> (no es el
            protagonismo 0). Ideales para «Completar con IA» o una frase tuya.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-semibold ${
                showUnnotedOnly ? "btn-primary" : "btn-secondary"
              }`}
              aria-pressed={showUnnotedOnly}
              onClick={() => {
                const next = !showUnnotedOnly;
                showUnnotedOnlyRef.current = next;
                setShowUnnotedOnly(next);
                setExpandedId(null);
              }}
            >
              {showUnnotedOnly ? "Ver todas las fotos" : "Solo sin nota de texto"}
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => focusUnnotedAt(unnotedCursor)}
            >
              Ir a una sin nota
            </button>
            {unnotedPhotoIds.length > 1 && (
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => focusUnnotedAt(unnotedCursor + 1)}
              >
                Siguiente sin nota
              </button>
            )}
          </div>
        </div>
      )}

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
            const placeName =
              photo.place?.name ??
              (photo.placeId
                ? places.find((p) => p.id === photo.placeId)?.name
                : undefined);

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
                      {placeName && (
                        <span className="tag-mint max-w-[12rem] truncate" title={placeName}>
                          {placeName}
                        </span>
                      )}
                      {photoNotes.length > 0 ? (
                        <span className="tag-mint">
                          {photoNotes.length} nota{photoNotes.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                          Sin nota
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

                    {(places.length > 0 ||
                      (onAddPlaceFromPhoto &&
                        isValidGps(photo.latitude, photo.longitude))) && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-fg-secondary">
                          Lugar asociado
                        </label>
                        {places.length > 0 && (
                          <select
                            className="form-input form-input-sm w-full"
                            value={photo.placeId ?? ""}
                            onChange={(e) => {
                              const nextPlaceId = e.target.value || null;
                              void applyPlaceLink(photo, nextPlaceId);
                            }}
                          >
                            <option value="">Sin lugar</option>
                            {places.map((place) => (
                              <option key={place.id} value={place.id}>
                                {place.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {photo.placeId && onOpenPlace && (
                            <button
                              type="button"
                              onClick={() => onOpenPlace(photo.placeId!)}
                              className="text-xs font-medium text-accent-mint underline-offset-2 hover:underline"
                            >
                              Ver lugar en el mapa
                            </button>
                          )}
                          {onAddPlaceFromPhoto &&
                            isValidGps(photo.latitude, photo.longitude) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAddPlaceFromPhoto({
                                    photoId: photo.id,
                                    latitude: photo.latitude!,
                                    longitude: photo.longitude!,
                                    visitedAt: photo.exifDateTime,
                                  })
                                }
                                className="chip-btn"
                              >
                                {photo.placeId
                                  ? "Crear otro lugar aquí"
                                  : "Añadir lugar"}
                              </button>
                            )}
                        </div>
                        {places.length === 0 &&
                          onAddPlaceFromPhoto &&
                          isValidGps(photo.latitude, photo.longitude) && (
                            <p className="text-[11px] text-fg-secondary">
                              Crea un lugar con el GPS de esta foto (nombre + tipo)
                              y aparecerá en el mapa.
                            </p>
                          )}
                      </div>
                    )}

                    <HighlightScoreControl
                      value={photo.highlightScore ?? 0}
                      onChange={(highlightScore) => {
                        setPhotos((prev) =>
                          prev.map((p) =>
                            p.id === photo.id ? { ...p, highlightScore } : p
                          )
                        );
                        void (async () => {
                          try {
                            const res = await fetch(`/api/photos/${photo.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ highlightScore }),
                            });
                            if (!res.ok) throw new Error("fail");
                          } catch {
                            void loadPage(pageRef.current, null, {
                              silent: true,
                            });
                          }
                        })();
                      }}
                    />

                    {nearby.length > 0 && !photo.placeId && (
                      <div className="callout callout-success text-xs">
                        <p className="mb-1.5 font-semibold">Cerca de un lugar marcado</p>
                        <ul className="space-y-1">
                          {nearby.slice(0, 3).map((place) => (
                            <li key={place.id} className="flex flex-wrap items-center gap-2">
                              {onOpenPlace ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenPlace(place.id)}
                                  className="font-medium text-accent-mint underline-offset-2 hover:underline"
                                >
                                  {place.name} ({formatDistanceM(place.distanceM)})
                                </button>
                              ) : (
                                <span className="font-medium text-fg">
                                  {place.name} ({formatDistanceM(place.distanceM)})
                                </span>
                              )}
                              <button
                                type="button"
                                className="chip-btn"
                                onClick={() => void applyPlaceLink(photo, place.id)}
                              >
                                Asociar
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {nearby.length > 0 && photo.placeId && (
                      <div className="callout callout-success text-xs">
                        <p className="mb-1.5 font-semibold">Otros lugares cerca</p>
                        <ul className="space-y-1">
                          {nearby
                            .filter((place) => place.id !== photo.placeId)
                            .slice(0, 2)
                            .map((place) => (
                              <li
                                key={place.id}
                                className="flex flex-wrap items-center gap-2"
                              >
                                {onOpenPlace ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenPlace(place.id)}
                                    className="font-medium text-accent-mint underline-offset-2 hover:underline"
                                  >
                                    {place.name} ({formatDistanceM(place.distanceM)})
                                  </button>
                                ) : (
                                  <span className="font-medium text-fg">
                                    {place.name} ({formatDistanceM(place.distanceM)})
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => void applyPlaceLink(photo, place.id)}
                                >
                                  Cambiar
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    <PhotoDateEditor
                      photo={photo}
                      onSaved={() => {
                        // Date change still needs a real refresh for timeline ordering.
                        onNoteCreated?.();
                      }}
                    />

                    {photoNotes.length > 0 && (
                      <ul className="space-y-2">
                        {photoNotes.map((note) => (
                          <EditableNote
                            key={note.id}
                            note={note}
                            onChanged={() => {
                              // After edit/delete, soft-refresh parent later; keep UI snappy.
                              scheduleParentRefresh();
                              void loadPage(pageRef.current, null, {
                                silent: true,
                              });
                            }}
                          />
                        ))}
                      </ul>
                    )}
                    <SuggestPhotoNote
                      travelId={travelId}
                      photoId={photo.id}
                      placeType={
                        photo.place?.type ??
                        (photo.placeId
                          ? places.find((p) => p.id === photo.placeId)?.type
                          : null) ??
                        null
                      }
                      lastPhotoNoteText={lastOtherPhotoNoteText(
                        photos,
                        photo.id
                      )}
                      authorAlias={
                        getSessionFromStorage()?.alias ?? photo.user.alias
                      }
                      onApplyDraft={(text) => {
                        setNotePrefill((prev) => ({
                          photoId: photo.id,
                          text,
                          nonce: (prev?.photoId === photo.id ? prev.nonce : 0) + 1,
                        }));
                      }}
                    />
                    <NoteForm
                      travelId={travelId}
                      userId={userId}
                      photoId={photo.id}
                      type="PHOTO"
                      prefillText={
                        notePrefill?.photoId === photo.id
                          ? notePrefill.text
                          : undefined
                      }
                      prefillNonce={
                        notePrefill?.photoId === photo.id
                          ? notePrefill.nonce
                          : 0
                      }
                      onCreated={(note) => {
                        if (note) {
                          patchPhotoNotes(photo.id, (notes) => {
                            if (notes.some((n) => n.id === note.id)) return notes;
                            return [
                              ...notes,
                              {
                                id: note.id,
                                text: note.text,
                                type: note.type,
                                user: { alias: note.user.alias },
                              },
                            ];
                          });
                        }
                        // Don't block the form on a full travel reload.
                        scheduleParentRefresh();
                      }}
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
