"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { PlaceType } from "@prisma/client";
import {
  PLACE_TYPE_LABELS,
  PLACE_TYPES,
  placeEmoji,
  placeLabel,
} from "@/lib/places";

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
  comment: string | null;
  user: { alias: string };
}

interface TravelPlacesPanelProps {
  travelId: string;
  userId: string;
  places: TravelPlace[];
  photos: { latitude: number | null; longitude: number | null }[];
  onChanged?: () => void;
}

interface DraftPlace {
  lat: number;
  lng: number;
  name: string;
  type: PlaceType;
  comment: string;
}

export default function TravelPlacesPanel({
  travelId,
  userId,
  places,
  photos,
  onChanged,
}: TravelPlacesPanelProps) {
  const [addMode, setAddMode] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlace = places.find((p) => p.id === selectedPlaceId) ?? null;

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setDraft({
      lat,
      lng,
      name: "",
      type: "OTHER",
      comment: "",
    });
    setSelectedPlaceId(null);
  }, []);

  const savePlace = async () => {
    if (!draft?.name.trim()) {
      setError("Escribe un nombre para el lugar");
      return;
    }

    setSaving(true);
    setError(null);

    try {
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
          comment: draft.comment || null,
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
      onChanged?.();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Lugares del viaje</h2>
          <p className="text-sm text-slate-500">
            Marca hoteles, restaurantes, miradores… Pin con emoji según tipo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddMode((v) => !v);
            setDraft(null);
            setError(null);
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

      <TravelPlacesMap
        places={places}
        photos={photos}
        selectedPlaceId={selectedPlaceId}
        addMode={addMode}
        draftPin={draft ? { lat: draft.lat, lng: draft.lng } : null}
        onMapClick={handleMapClick}
        onPlaceClick={setSelectedPlaceId}
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Comentario (opcional)</span>
            <textarea
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
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
                onClick={() => setSelectedPlaceId(place.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="mr-2 text-lg">{placeEmoji(place.type)}</span>
                <span className="font-medium text-slate-800">{place.name}</span>
                <span className="ml-2 text-xs text-slate-400">{placeLabel(place.type)}</span>
                <p className="mt-0.5 text-xs text-slate-500">
                  {place.user.alias}
                  {place.comment ? ` · ${place.comment}` : ""}
                </p>
              </button>
              <button
                type="button"
                onClick={() => deletePlace(place.id)}
                className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}

      {places.length === 0 && !draft && (
        <p className="text-center text-sm text-slate-500">
          Aún no hay lugares marcados. Pulsa «Marcar lugar» y toca el mapa.
        </p>
      )}

      {selectedPlace && !draft && (
        <p className="text-center text-xs text-slate-400">
          Seleccionado: {placeEmoji(selectedPlace.type)} {selectedPlace.name}
        </p>
      )}
    </div>
  );
}
