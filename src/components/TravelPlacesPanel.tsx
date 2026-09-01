"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlaceType } from "@prisma/client";
import {
  PLACE_TYPE_LABELS,
  PLACE_TYPES,
  placeEmoji,
  placeLabel,
} from "@/lib/places";
import type { FlightLegPhoto } from "@/lib/flights";
import { formatFlightDate, resolveFlightLegs } from "@/lib/flights";
import { createLocalId } from "@/lib/utils";
import SecureLocationHint from "@/components/SecureLocationHint";
import EmptyMemoryState from "@/components/EmptyMemoryState";
import NoteForm from "@/components/NoteForm";
import EditableNote from "@/components/EditableNote";
import MemoryDateTimeField, {
  dateTimeToIso,
  isoToDateAndTime,
} from "@/components/MemoryDateTimeField";
import { findNearby, formatDistanceM, NEARBY_THRESHOLD_M } from "@/lib/geo";
import { formatDateKey, isoToDateKey, todayKey } from "@/lib/travel-dates";

const TravelPlacesMap = dynamic(() => import("@/components/TravelPlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
      Cargando mapa…
    </div>
  ),
});

export interface TravelPlace {
  id: string;
  name: string;
  type: PlaceType;
  latitude: number;
  longitude: number;
  /** @deprecated Prefer `notes` (NoteType.PLACE) */
  comment: string | null;
  user: { alias: string };
  visitedAt?: string | null;
  notes?: {
    id: string;
    text: string;
    user: { alias: string };
  }[];
}

interface TravelPlacesPanelProps {
  travelId: string;
  userId: string;
  places: TravelPlace[];
  photos: FlightLegPhoto[];
  onChanged?: () => void;
  /** Increment to enter “Marcar lugar” from Añadir recuerdo / ?add=place */
  startAddSignal?: number;
  /** Select this place (mapa / sinergias desde fotos). */
  focusPlaceId?: string | null;
  onOpenPhoto?: (photoId: string) => void;
  onOpenFotosTab?: () => void;
  onAddPlace?: () => void;
  /** Default date when marking a place (e.g. travel start). */
  travelStartDate?: string | null;
}

interface DraftPlace {
  lat: number;
  lng: number;
  name: string;
  type: PlaceType;
  comment: string;
  visitedAtDate: string;
  visitedAtTime: string;
}

function defaultPlaceDate(travelStartDate?: string | null): string {
  if (travelStartDate) return isoToDateKey(travelStartDate);
  return todayKey();
}

function formatVisitedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const key = isoToDateKey(iso);
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return `${formatDateKey(key)} · ${time}`;
}

export default function TravelPlacesPanel({
  travelId,
  userId,
  places,
  photos,
  onChanged,
  startAddSignal = 0,
  focusPlaceId = null,
  onOpenPhoto,
  onOpenFotosTab,
  onAddPlace,
  travelStartDate = null,
}: TravelPlacesPanelProps) {
  const [addMode, setAddMode] = useState(false);
  const [pickOnMap, setPickOnMap] = useState(true);
  const [locateSignal, setLocateSignal] = useState(0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPlace | null>(null);
  const [editForm, setEditForm] = useState<{
    id: string;
    name: string;
    type: PlaceType;
    visitedAtDate: string;
    visitedAtTime: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!startAddSignal) return;
    setAddMode(true);
    setDraft(null);
    setEditForm(null);
    setError(null);
    setPickOnMap(true);
    setSelectedPlaceId(null);
  }, [startAddSignal]);

  useEffect(() => {
    if (!focusPlaceId) return;
    setAddMode(false);
    setDraft(null);
    setEditForm(null);
    setSelectedPlaceId(focusPlaceId);
  }, [focusPlaceId]);

  const selectedPlace = places.find((p) => p.id === selectedPlaceId) ?? null;
  const { outbound, inbound } = resolveFlightLegs(photos);

  const nearbyPhotosForSelected = useMemo(() => {
    if (!selectedPlace) return [];
    const withGps = photos.filter(
      (p) =>
        p.latitude != null &&
        p.longitude != null &&
        !p.isTransportStart &&
        !p.isTransportEnd
    ) as Array<FlightLegPhoto & { latitude: number; longitude: number }>;
    return findNearby(
      {
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
      },
      withGps,
      NEARBY_THRESHOLD_M
    );
  }, [selectedPlace, photos]);

  const placeNotes = (place: TravelPlace) => {
    if (place.notes && place.notes.length > 0) return place.notes;
    if (place.comment?.trim()) {
      return [
        {
          id: `legacy-${place.id}`,
          text: place.comment.trim(),
          user: place.user,
        },
      ];
    }
    return [];
  };

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      const defaultDate = defaultPlaceDate(travelStartDate);
      setDraft({
        lat,
        lng,
        name: "",
        type: "OTHER",
        comment: "",
        visitedAtDate: defaultDate,
        visitedAtTime: "12:00",
      });
      setSelectedPlaceId(null);
      setEditForm(null);
    },
    [travelStartDate]
  );

  const startEditPlace = (place: TravelPlace) => {
    const when = isoToDateAndTime(place.visitedAt);
    setAddMode(false);
    setDraft(null);
    setSelectedPlaceId(place.id);
    setEditForm({
      id: place.id,
      name: place.name,
      type: place.type,
      visitedAtDate: when.date || defaultPlaceDate(travelStartDate),
      visitedAtTime: when.time,
    });
    setError(null);
  };

  const saveEditedPlace = async () => {
    if (!editForm?.name.trim()) {
      setError("Escribe un nombre para el lugar");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const visitedAt = dateTimeToIso(editForm.visitedAtDate, editForm.visitedAtTime);
      const res = await fetch(`/api/places/${editForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          type: editForm.type,
          visitedAt,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      setEditForm(null);
      onChanged?.();
    } catch {
      setError("Error al actualizar el lugar");
    } finally {
      setSaving(false);
    }
  };

  const savePlace = async () => {
    if (!draft?.name.trim()) {
      setError("Escribe un nombre para el lugar");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const visitedAt = dateTimeToIso(draft.visitedAtDate, draft.visitedAtTime);
      if (!visitedAt) {
        setError("Indica cuándo visitaste este lugar");
        setSaving(false);
        return;
      }

      if (!navigator.onLine) {
        const { savePendingPlace, savePendingNote } = await import(
          "@/lib/offline-db"
        );
        const placeLocalId = createLocalId();
        await savePendingPlace({
          localId: placeLocalId,
          travelId,
          userId,
          name: draft.name.trim(),
          type: draft.type,
          latitude: draft.lat,
          longitude: draft.lng,
          comment: null,
          visitedAt,
          createdAt: visitedAt,
        });
        if (draft.comment.trim()) {
          await savePendingNote({
            localId: createLocalId(),
            travelId,
            userId,
            photoLocalId: null,
            placeId: null,
            placeLocalId,
            type: "PLACE",
            dayDate: null,
            text: draft.comment.trim(),
            createdAt: new Date().toISOString(),
          });
        }
        setDraft(null);
        setAddMode(false);
        onChanged?.();
        return;
      }

      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          userId,
          name: draft.name,
          type: draft.type,
          latitude: draft.lat,
          longitude: draft.lng,
          comment: draft.comment.trim() || null,
          visitedAt,
        }),
      });

      if (!res.ok) throw new Error("No se pudo guardar");

      setDraft(null);
      setAddMode(false);
      onChanged?.();
    } catch {
      setError("Error al guardar el lugar");
    } finally {
      setSaving(false);
    }
  };

  const deletePlace = async (id: string) => {
    if (!confirm("¿Eliminar este lugar del mapa?")) return;

    const res = await fetch(`/api/places/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedPlaceId === id) setSelectedPlaceId(null);
      if (editForm?.id === id) setEditForm(null);
      onChanged?.();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Lugares del viaje</h2>
          <p className="text-sm text-slate-500">
            Marca hoteles, restaurantes, miradores… Igual que en DogTrainer: usa tu GPS o elige en el mapa Mapbox.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddMode((v) => !v);
            setDraft(null);
            setEditForm(null);
            setError(null);
            setPickOnMap(true);
          }}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            addMode
              ? "bg-slate-800 text-white"
              : "bg-teal-600 text-white hover:bg-teal-700"
          }`}
        >
          {addMode ? "Cancelar marcado" : "+ Marcar lugar"}
        </button>
      </div>

      <SecureLocationHint />

      {addMode && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">
            Ubicación
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPickOnMap(false);
                setLocateSignal((n) => n + 1);
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                !pickOnMap
                  ? "bg-teal-600 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              📍 Mi ubicación
            </button>
            <button
              type="button"
              onClick={() => setPickOnMap(true)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                pickOnMap
                  ? "bg-teal-600 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              Elegir en mapa
            </button>
          </div>
          {pickOnMap && !draft && (
            <p className="text-xs font-medium text-teal-800 animate-pulse">
              Haz clic en el mapa para seleccionar la ubicación
            </p>
          )}
          {!pickOnMap && !draft && (
            <p className="text-xs text-slate-600">
              Pulsando «Mi ubicación» se centra el mapa y coloca el pin en tu GPS
            </p>
          )}
          {draft && (
            <p className="text-xs text-teal-700">
              ✓ Ubicación seleccionada ({draft.lat.toFixed(4)}, {draft.lng.toFixed(4)})
            </p>
          )}
        </div>
      )}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
        <h3 className="text-sm font-semibold text-indigo-900">Vuelos ida / vuelta</h3>
        <p className="mt-1 text-xs text-indigo-700/80">
          Derivado de fotos marcadas como Ida o Vuelta en la pestaña Fotos (no se crean aquí).
          Si tienen GPS de aeropuerto, aparecen en el mapa con línea discontinua.
        </p>
        {onOpenFotosTab && (
          <button
            type="button"
            onClick={onOpenFotosTab}
            className="mt-2 text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline"
          >
            Ir a Fotos para marcar Ida/Vuelta →
          </button>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FlightLegCard leg={outbound} emptyLabel="Sin foto de ida marcada" />
          <FlightLegCard leg={inbound} emptyLabel="Sin foto de vuelta marcada" />
        </div>
      </section>

      <TravelPlacesMap
        places={places}
        photos={photos}
        selectedPlaceId={selectedPlaceId}
        selectedPhotoId={selectedPhotoId}
        addMode={addMode}
        clickToPlace={addMode && pickOnMap}
        locateSignal={locateSignal}
        draftPin={draft ? { lat: draft.lat, lng: draft.lng } : null}
        onMapClick={handleMapClick}
        onPlaceClick={(id) => {
          setSelectedPlaceId(id);
          setSelectedPhotoId(null);
          setEditForm(null);
        }}
        onPhotoClick={(id) => {
          setSelectedPhotoId(id);
          onOpenPhoto?.(id);
        }}
      />

      {draft && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
          <p className="text-sm font-medium text-teal-900">Nuevo lugar</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Nombre</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ej. Hotel Central"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tipo</span>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as PlaceType })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {PLACE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {placeEmoji(t)} {PLACE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <MemoryDateTimeField
            label="¿Cuándo estuviste aquí?"
            date={draft.visitedAtDate}
            time={draft.visitedAtTime}
            onDateChange={(d) => setDraft({ ...draft, visitedAtDate: d })}
            onTimeChange={(t) => setDraft({ ...draft, visitedAtTime: t })}
            hint="Importante para viajes pasados: ordena el recorrido en la crónica y el blog."
          />
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Nota del lugar (opcional)
            </label>
            <textarea
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              rows={3}
              placeholder="Escribe tu anécdota, impresión o detalle…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <p className="text-xs text-slate-500">
            Coordenadas: {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={savePlace}
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar lugar"}
          </button>
        </div>
      )}

      {editForm && !draft && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">Editar lugar</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Nombre</span>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tipo</span>
              <select
                value={editForm.type}
                onChange={(e) =>
                  setEditForm({ ...editForm, type: e.target.value as PlaceType })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {PLACE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {placeEmoji(t)} {PLACE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <MemoryDateTimeField
            label="Fecha de la visita"
            date={editForm.visitedAtDate}
            time={editForm.visitedAtTime}
            onDateChange={(d) => setEditForm({ ...editForm, visitedAtDate: d })}
            onTimeChange={(t) => setEditForm({ ...editForm, visitedAtTime: t })}
          />
          <p className="text-xs text-slate-500">
            Nombre y tipo. La nota se escribe debajo al seleccionar el lugar, con la misma UI que
            foto, día o viaje.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveEditedPlace}
              disabled={saving}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditForm(null);
                setError(null);
              }}
              disabled={saving}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {places.length > 0 && (
        <ul className="space-y-2">
          {places.map((place) => (
            <li
              key={place.id}
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
                selectedPlaceId === place.id
                  ? "border-teal-300 bg-teal-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setEditForm(null);
                  setSelectedPlaceId(place.id);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="mr-2 text-lg">{placeEmoji(place.type)}</span>
                <span className="font-medium text-slate-800">{place.name}</span>
                <span className="ml-2 text-xs text-slate-400">{placeLabel(place.type)}</span>
                <p className="mt-0.5 text-xs text-slate-500">
                  {place.user.alias}
                  {formatVisitedAt(place.visitedAt)
                    ? ` · ${formatVisitedAt(place.visitedAt)}`
                    : ""}
                  {placeNotes(place).length > 0 ? " · con nota" : ""}
                </p>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => startEditPlace(place)}
                  className="text-xs font-medium text-slate-500 hover:text-teal-700"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deletePlace(place.id)}
                  className="text-xs font-medium text-red-600 hover:text-red-800"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedPlace && !draft && !editForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {placeEmoji(selectedPlace.type)} {selectedPlace.name}
            </p>
            <p className="text-xs text-slate-500">
              Notas del lugar · {selectedPlace.user.alias}
              {formatVisitedAt(selectedPlace.visitedAt)
                ? ` · ${formatVisitedAt(selectedPlace.visitedAt)}`
                : ""}
            </p>
          </div>
          {placeNotes(selectedPlace).length > 0 && (
            <ul className="space-y-3">
              {placeNotes(selectedPlace).map((note) =>
                note.id.startsWith("legacy-") ? (
                  <li
                    key={note.id}
                    className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <span className="font-medium text-teal-700">
                      {note.user.alias}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap">{note.text}</p>
                    <p className="mt-1 text-[10px] text-amber-700">
                      Nota antigua — se migrará al sincronizar el esquema.
                    </p>
                  </li>
                ) : (
                  <EditableNote
                    key={note.id}
                    note={note}
                    onChanged={onChanged}
                  />
                )
              )}
            </ul>
          )}
          <NoteForm
            travelId={travelId}
            userId={userId}
            type="PLACE"
            placeId={selectedPlace.id}
            onCreated={onChanged}
          />
          {nearbyPhotosForSelected.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fotos cerca ({NEARBY_THRESHOLD_M} m)
              </p>
              <div className="flex flex-wrap gap-2">
                {nearbyPhotosForSelected.slice(0, 6).map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onOpenPhoto?.(photo.id)}
                    className="group relative overflow-hidden rounded-lg ring-1 ring-slate-200"
                    title={`${formatDistanceM(photo.distanceM)}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
                      className="h-14 w-14 object-cover transition group-hover:opacity-90"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/50 px-0.5 text-center text-[9px] text-white">
                      {formatDistanceM(photo.distanceM)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {places.length === 0 && !draft && (
        <EmptyMemoryState
          title="Aún no hay lugares"
          description="Marca hoteles, restaurantes o miradores en el mapa para enriquecer la crónica."
          actionLabel="Marcar lugar"
          onAction={onAddPlace}
        />
      )}
    </div>
  );
}

function FlightLegCard({
  leg,
  emptyLabel,
}: {
  leg: ReturnType<typeof resolveFlightLegs>["outbound"];
  emptyLabel: string;
}) {
  if (!leg) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-3 py-4 text-xs text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-xl border border-indigo-200 bg-white px-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leg.photo.url}
        alt=""
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-800">
          {leg.emoji} {leg.label}
        </p>
        <p className="text-xs text-slate-500">{leg.photo.user.alias}</p>
        <p className="text-xs text-slate-500">{formatFlightDate(leg.photo.exifDateTime)}</p>
        <p
          className={`mt-1 text-xs font-medium ${leg.hasGps ? "text-teal-700" : "text-amber-700"}`}
        >
          {leg.hasGps
            ? "Visible en el mapa"
            : "Sin GPS — marca el aeropuerto como lugar Transporte"}
        </p>
      </div>
    </div>
  );
}
