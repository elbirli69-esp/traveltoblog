"use client";

import { useEffect, useRef } from "react";
import type { PlaceType } from "@prisma/client";
import {
  computeMapCenter,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
  placeEmoji,
} from "@/lib/places";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

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
  photos: { latitude: number | null; longitude: number | null }[];
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
  const markersRef = useRef<LeafletMarker[]>([]);
  const handlersRef = useRef({ onMapClick, onPlaceClick, addMode });

  handlersRef.current = { onMapClick, onPlaceClick, addMode };

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
        zoom: places.length || photos.some((p) => p.latitude != null) ? 6 : 4,
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
      renderMarkers(L, map);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      renderMarkers(L, map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, photos, selectedPlaceId, draftPin, addMode]);

  function renderMarkers(L: typeof import("leaflet"), map: LeafletMap) {
    for (const marker of markersRef.current) {
      marker.remove();
    }
    markersRef.current = [];

    for (const photo of photos) {
      if (photo.latitude == null || photo.longitude == null) continue;
      const marker = L.circleMarker([photo.latitude, photo.longitude], {
        radius: 4,
        color: "#94a3b8",
        fillColor: "#cbd5e1",
        fillOpacity: 0.8,
        weight: 1,
      }).addTo(map);
      markersRef.current.push(marker as unknown as LeafletMarker);
    }

    for (const place of places) {
      const emoji = placeEmoji(place.type);
      const isSelected = place.id === selectedPlaceId;
      const icon = L.divIcon({
        html: `<div style="font-size:${isSelected ? "28" : "24"}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));transform:translate(-50%,-50%)">${emoji}</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([place.latitude, place.longitude], { icon }).addTo(map);
      marker.bindPopup(
        `<strong>${escapeHtml(place.name)}</strong>${place.comment ? `<br>${escapeHtml(place.comment)}` : ""}`
      );
      marker.on("click", () => handlersRef.current.onPlaceClick(place.id));
      markersRef.current.push(marker);
    }

    if (draftPin) {
      const icon = L.divIcon({
        html: `<div style="font-size:28px;line-height:1;opacity:.85">📍</div>`,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([draftPin.lat, draftPin.lng], { icon }).addTo(map);
      markersRef.current.push(marker);
    }

    const boundsCoords: [number, number][] = [
      ...places.map((p) => [p.latitude, p.longitude] as [number, number]),
      ...photos
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => [p.latitude!, p.longitude!] as [number, number]),
    ];
    if (draftPin) boundsCoords.push([draftPin.lat, draftPin.lng]);

    if (boundsCoords.length > 1) {
      map.fitBounds(L.latLngBounds(boundsCoords).pad(0.12));
    } else if (boundsCoords.length === 1) {
      map.setView(boundsCoords[0], 13);
    }
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`h-[420px] w-full rounded-2xl border border-slate-200 ${
          addMode ? "cursor-crosshair ring-2 ring-teal-400/50" : ""
        }`}
      />
      {addMode && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-700/90 px-3 py-1 text-xs font-medium text-white shadow">
          Toca el mapa para colocar el pin
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
