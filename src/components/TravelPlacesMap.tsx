"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceType } from "@prisma/client";
import type { FlightLegPhoto } from "@/lib/flights";
import {
  FLIGHT_IN_EMOJI,
  FLIGHT_OUT_EMOJI,
  formatFlightDate,
  photoGpsPoints,
  resolveFlightLegs,
} from "@/lib/flights";
import {
  computeMapCenter,
  geolocationErrorMessage,
  getCurrentPosition,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
  placeEmoji,
  type GeolocationFailure,
} from "@/lib/places";
import type { Layer, Map as LeafletMap } from "leaflet";

export interface MapPlace {
  id: string;
  name: string;
  type: PlaceType;
  latitude: number;
  longitude: number;
  comment?: string | null;
}

interface TravelPlacesMapProps {
  places: MapPlace[];
  photos: FlightLegPhoto[];
  selectedPlaceId: string | null;
  addMode: boolean;
  draftPin: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onPlaceClick: (id: string) => void;
}

export default function TravelPlacesMap({
  places,
  photos,
  selectedPlaceId,
  addMode,
  draftPin,
  onMapClick,
  onPlaceClick,
}: TravelPlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const handlersRef = useRef({ onMapClick, onPlaceClick, addMode });
  const skipAutoFitRef = useRef(false);
  const placesCountRef = useRef(places.length);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);

  handlersRef.current = { onMapClick, onPlaceClick, addMode };

  const { outbound, inbound } = resolveFlightLegs(photos);
  const routePhotos = photoGpsPoints(photos);

  useEffect(() => {
    if (places.length !== placesCountRef.current) {
      placesCountRef.current = places.length;
      skipAutoFitRef.current = false;
    }
  }, [places.length]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      const leaflet = await import("leaflet");
      const L = leaflet.default ?? leaflet;

      if (cancelled || !containerRef.current) return;

      const [lat, lng] = computeMapCenter(places, photos);
      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom:
          places.length || photos.some((p) => p.latitude != null) ? 6 : 4,
        scrollWheelZoom: true,
      });

      L.tileLayer(MAP_TILE_URL, {
        attribution: MAP_TILE_ATTRIBUTION,
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      map.on("click", (e) => {
        if (handlersRef.current.addMode) {
          handlersRef.current.onMapClick(e.latlng.lat, e.latlng.lng);
        }
      });

      mapRef.current = map;
      renderLayers(L, map);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      renderLayers(L, map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, photos, selectedPlaceId, draftPin, addMode, outbound, inbound, userLocation]);

  const locateUser = useCallback(async () => {
    setLocating(true);
    setLocateError(null);

    try {
      const coords = await getCurrentPosition();
      const lat = coords.latitude;
      const lng = coords.longitude;
      const accuracy = coords.accuracy;

      skipAutoFitRef.current = true;
      setUserLocation({ lat, lng, accuracy });

      const map = mapRef.current;
      if (map) {
        map.setView([lat, lng], 16, { animate: true });
      }

      if (handlersRef.current.addMode) {
        handlersRef.current.onMapClick(lat, lng);
      }
    } catch (err) {
      const code = (err instanceof Error ? err.message : "unavailable") as GeolocationFailure;
      setLocateError(geolocationErrorMessage(code));
    } finally {
      setLocating(false);
    }
  }, []);

  function clearLayers() {
    for (const layer of layersRef.current) {
      layer.remove();
    }
    layersRef.current = [];
  }

  function addLayer(layer: Layer) {
    layersRef.current.push(layer);
  }

  function renderLayers(L: typeof import("leaflet"), map: LeafletMap) {
    clearLayers();

    const routeLatLngs = routePhotos.map(
      (p) => [p.latitude!, p.longitude!] as [number, number]
    );
    if (routeLatLngs.length > 1) {
      addLayer(
        L.polyline(routeLatLngs, {
          color: "#0d9488",
          weight: 3,
          opacity: 0.75,
        }).addTo(map)
      );
    }

    if (outbound?.hasGps && inbound?.hasGps) {
      addLayer(
        L.polyline(
          [
            [outbound.photo.latitude!, outbound.photo.longitude!],
            [inbound.photo.latitude!, inbound.photo.longitude!],
          ],
          { color: "#6366f1", weight: 3, opacity: 0.9, dashArray: "10 8" }
        ).addTo(map)
      );
    }

    for (const photo of routePhotos) {
      addLayer(
        L.circleMarker([photo.latitude!, photo.longitude!], {
          radius: 4,
          color: "#94a3b8",
          fillColor: "#cbd5e1",
          fillOpacity: 0.8,
          weight: 1,
        }).addTo(map)
      );
    }

    const renderFlight = (leg: NonNullable<typeof outbound>, emoji: string) => {
      const { photo } = leg;
      const icon = L.divIcon({
        html: `<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))">${emoji}</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([photo.latitude!, photo.longitude!], { icon }).addTo(map);
      marker.bindPopup(
        `<strong>${escapeHtml(leg.label)}</strong><br>${escapeHtml(photo.user.alias)}<br><small>${escapeHtml(formatFlightDate(photo.exifDateTime))}</small>`
      );
      addLayer(marker);
    };

    if (outbound?.hasGps) renderFlight(outbound, FLIGHT_OUT_EMOJI);
    if (inbound?.hasGps) renderFlight(inbound, FLIGHT_IN_EMOJI);

    for (const place of places) {
      const emoji = placeEmoji(place.type);
      const isSelected = place.id === selectedPlaceId;
      const icon = L.divIcon({
        html: `<div style="font-size:${isSelected ? "28" : "24"}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${emoji}</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([place.latitude, place.longitude], { icon }).addTo(map);
      marker.bindPopup(
        `<strong>${escapeHtml(place.name)}</strong>${place.comment ? `<br>${escapeHtml(place.comment)}` : ""}`
      );
      marker.on("click", () => handlersRef.current.onPlaceClick(place.id));
      addLayer(marker);
    }

    if (userLocation) {
      addLayer(
        L.circle([userLocation.lat, userLocation.lng], {
          radius: Math.max(userLocation.accuracy, 25),
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 0.12,
          weight: 2,
          opacity: 0.45,
        }).addTo(map)
      );
      addLayer(
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 7,
          color: "#fff",
          fillColor: "#2563eb",
          fillOpacity: 1,
          weight: 3,
        }).addTo(map)
      );
    }

    if (draftPin) {
      const icon = L.divIcon({
        html: `<div style="font-size:28px;line-height:1;opacity:.85">📍</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      addLayer(L.marker([draftPin.lat, draftPin.lng], { icon }).addTo(map));
    }

    if (skipAutoFitRef.current) return;

    const boundsCoords: [number, number][] = [
      ...places.map((p) => [p.latitude, p.longitude] as [number, number]),
      ...routePhotos.map(
        (p) => [p.latitude!, p.longitude!] as [number, number]
      ),
    ];
    if (outbound?.hasGps) {
      boundsCoords.push([outbound.photo.latitude!, outbound.photo.longitude!]);
    }
    if (inbound?.hasGps) {
      boundsCoords.push([inbound.photo.latitude!, inbound.photo.longitude!]);
    }
    if (draftPin) boundsCoords.push([draftPin.lat, draftPin.lng]);

    if (boundsCoords.length > 1) {
      map.fitBounds(L.latLngBounds(boundsCoords).pad(0.12));
    } else if (boundsCoords.length === 1) {
      map.setView(boundsCoords[0], 13);
    }
  }

  const hasFlightLine = outbound?.hasGps && inbound?.hasGps;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`h-[420px] w-full rounded-2xl border border-slate-200 ${
          addMode ? "cursor-crosshair ring-2 ring-teal-400/50" : ""
        }`}
      />
      <div className="pointer-events-none absolute left-3 top-3 space-y-1 rounded-lg bg-white/90 px-2.5 py-2 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur-sm">
        {outbound && (
          <span className="flex items-center gap-1">
            {FLIGHT_OUT_EMOJI} Ida{outbound.hasGps ? "" : " (sin GPS)"}
          </span>
        )}
        {inbound && (
          <span className="flex items-center gap-1">
            {FLIGHT_IN_EMOJI} Vuelta{inbound.hasGps ? "" : " (sin GPS)"}
          </span>
        )}
        {hasFlightLine && (
          <span className="flex items-center gap-1 text-indigo-600">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-indigo-500" />
            Trayecto aéreo
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={locateUser}
        disabled={locating}
        className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
        aria-label="Centrar mapa en mi ubicación"
      >
        {locating ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
            Localizando…
          </>
        ) : (
          <>
            <span aria-hidden>📍</span>
            Mi ubicación
          </>
        )}
      </button>
      {locateError && (
        <p className="absolute bottom-14 right-3 max-w-[220px] rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow ring-1 ring-red-200">
          {locateError}
        </p>
      )}
      {addMode && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-700/90 px-3 py-1 text-xs font-medium text-white shadow">
          Toca el mapa o «Mi ubicación» para colocar el pin
        </p>
      )}
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
