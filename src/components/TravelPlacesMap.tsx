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
import { computeMapCenter, placeEmoji, isGeolocationSecureContext } from "@/lib/places";
import {
  createEmojiMarkerElement,
  loadMapbox,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
} from "@/lib/mapbox";
import type { GeoJSONSource, Map as MapboxMap, Marker, GeolocateControl } from "mapbox-gl";

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
  /** When true, map clicks place the draft pin (DogTrainer "Elegir en mapa"). */
  clickToPlace?: boolean;
  /** Increment to trigger Mapbox GeolocateControl (DogTrainer "Mi ubicación"). */
  locateSignal?: number;
  draftPin: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onPlaceClick: (id: string) => void;
}

export default function TravelPlacesMap({
  places,
  photos,
  selectedPlaceId,
  addMode,
  clickToPlace = false,
  locateSignal = 0,
  draftPin,
  onMapClick,
  onPlaceClick,
}: TravelPlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const geolocateRef = useRef<GeolocateControl | null>(null);
  const handlersRef = useRef({ onMapClick, onPlaceClick, addMode, clickToPlace });
  const skipAutoFitRef = useRef(false);
  const placesCountRef = useRef(places.length);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  handlersRef.current = { onMapClick, onPlaceClick, addMode, clickToPlace };

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
    if (!MAPBOX_TOKEN) {
      setMapError(
        "Falta NEXT_PUBLIC_MAPBOX_TOKEN. Usa el mismo token de Mapbox que DogTrainer."
      );
      return;
    }

    let cancelled = false;

    void loadMapbox()
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;
        const [lat, lng] = computeMapCenter(places, photos);

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: MAPBOX_STYLE,
          center: [lng, lat],
          zoom:
            places.length || photos.some((p) => p.latitude != null) ? 6 : 5,
          attributionControl: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "bottom-right");

        const geolocate = new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
          showUserHeading: true,
          showAccuracyCircle: true,
          fitBoundsOptions: { maxZoom: 16 },
        });
        map.addControl(geolocate, "bottom-right");
        geolocateRef.current = geolocate;

        geolocate.on("geolocate", (e) => {
          const { latitude, longitude } = e.coords;
          skipAutoFitRef.current = true;
          setLocateError(null);
          setLocating(false);
          if (handlersRef.current.addMode) {
            handlersRef.current.onMapClick(latitude, longitude);
          }
        });
        geolocate.on("error", () => {
          setLocating(false);
          if (!isGeolocationSecureContext()) {
            setLocateError(
              "El GPS del móvil solo funciona por HTTPS. Abre la URL segura de Tailscale o usa «Elegir en mapa»."
            );
          } else {
            setLocateError(
              "No se pudo obtener tu ubicación. Revisa el permiso de GPS del navegador."
            );
          }
        });

        map.on("click", (e) => {
          if (handlersRef.current.clickToPlace) {
            skipAutoFitRef.current = true;
            handlersRef.current.onMapClick(e.lngLat.lat, e.lngLat.lng);
          }
        });

        map.on("load", () => {
          mapRef.current = map;
          setMapReady(true);
          map.resize();
        });
      })
      .catch(() => {
        setMapError("No se pudo cargar Mapbox. Comprueba la conexión.");
      });

    return () => {
      cancelled = true;
      clearMarkers();
      geolocateRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getCanvas().style.cursor = clickToPlace ? "crosshair" : "";
  }, [clickToPlace, mapReady]);

  useEffect(() => {
    if (!locateSignal || !mapReady) return;
    setLocateError(null);
    if (!isGeolocationSecureContext()) {
      setLocateError(
        "El GPS del móvil solo funciona por HTTPS. Abre la URL segura de Tailscale o usa «Elegir en mapa»."
      );
      return;
    }
    setLocating(true);
    skipAutoFitRef.current = true;
    try {
      geolocateRef.current?.trigger();
    } catch {
      setLocating(false);
      setLocateError("No se pudo activar la geolocalización");
    }
  }, [locateSignal, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    void loadMapbox().then((mapboxgl) => {
      clearMarkers();

      const bounds: [number, number][] = [];

      const routeCoords = routePhotos.map(
        (p) => [p.longitude!, p.latitude!] as [number, number]
      );
      if (map.getSource("photo-route")) {
        (map.getSource("photo-route") as GeoJSONSource).setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: routeCoords.length > 1 ? routeCoords : [],
          },
        });
      } else if (routeCoords.length > 1) {
        map.addSource("photo-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: routeCoords },
          },
        });
        map.addLayer({
          id: "photo-route-line",
          type: "line",
          source: "photo-route",
          paint: {
            "line-color": "#0d9488",
            "line-width": 3,
            "line-opacity": 0.75,
          },
        });
      }

      const flightCoords =
        outbound?.hasGps && inbound?.hasGps
          ? ([
              [outbound.photo.longitude!, outbound.photo.latitude!],
              [inbound.photo.longitude!, inbound.photo.latitude!],
            ] as [number, number][])
          : [];
      if (map.getSource("flight-route")) {
        (map.getSource("flight-route") as GeoJSONSource).setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: flightCoords,
          },
        });
      } else if (flightCoords.length === 2) {
        map.addSource("flight-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: flightCoords },
          },
        });
        map.addLayer({
          id: "flight-route-line",
          type: "line",
          source: "flight-route",
          paint: {
            "line-color": "#6366f1",
            "line-width": 3,
            "line-opacity": 0.9,
            "line-dasharray": [2, 1.5],
          },
        });
      }

      for (const photo of routePhotos) {
        bounds.push([photo.longitude!, photo.latitude!]);
        const el = document.createElement("div");
        el.style.width = "8px";
        el.style.height = "8px";
        el.style.borderRadius = "50%";
        el.style.background = "#cbd5e1";
        el.style.border = "1px solid #94a3b8";
        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([photo.longitude!, photo.latitude!])
            .addTo(map)
        );
      }

      const addFlight = (
        leg: NonNullable<typeof outbound>,
        emoji: string
      ) => {
        const { photo } = leg;
        bounds.push([photo.longitude!, photo.latitude!]);
        const el = createEmojiMarkerElement(emoji, 30);
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<strong>${escapeHtml(leg.label)}</strong><br>${escapeHtml(photo.user.alias)}<br><small>${escapeHtml(formatFlightDate(photo.exifDateTime))}</small>`
        );
        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([photo.longitude!, photo.latitude!])
            .setPopup(popup)
            .addTo(map)
        );
      };
      if (outbound?.hasGps) addFlight(outbound, FLIGHT_OUT_EMOJI);
      if (inbound?.hasGps) addFlight(inbound, FLIGHT_IN_EMOJI);

      for (const place of places) {
        bounds.push([place.longitude, place.latitude]);
        const isSelected = place.id === selectedPlaceId;
        const el = createEmojiMarkerElement(placeEmoji(place.type), isSelected ? 30 : 24);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          handlersRef.current.onPlaceClick(place.id);
        });
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<strong>${escapeHtml(place.name)}</strong>${place.comment ? `<br>${escapeHtml(place.comment)}` : ""}`
        );
        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([place.longitude, place.latitude])
            .setPopup(popup)
            .addTo(map)
        );
      }

      if (draftPin) {
        bounds.push([draftPin.lng, draftPin.lat]);
        const el = createEmojiMarkerElement("📍", 30);
        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([draftPin.lng, draftPin.lat])
            .addTo(map)
        );
      }

      if (!skipAutoFitRef.current) {
        if (bounds.length > 1) {
          const b = bounds.reduce(
            (acc, [lng, lat]) => acc.extend([lng, lat]),
            new mapboxgl.LngLatBounds(bounds[0], bounds[0])
          );
          map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 600 });
        } else if (bounds.length === 1) {
          map.easeTo({ center: bounds[0], zoom: 13, duration: 600 });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    places,
    photos,
    selectedPlaceId,
    draftPin,
    addMode,
    outbound,
    inbound,
    mapReady,
  ]);

  const clearMarkers = () => {
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
  };

  const locateUser = useCallback(() => {
    setLocateError(null);
    if (!isGeolocationSecureContext()) {
      setLocateError(
        "El GPS del móvil solo funciona por HTTPS. Abre la URL segura de Tailscale o usa «Elegir en mapa»."
      );
      return;
    }
    setLocating(true);
    skipAutoFitRef.current = true;
    const control = geolocateRef.current;
    if (!control) {
      setLocating(false);
      setLocateError("El mapa aún no está listo");
      return;
    }
    try {
      control.trigger();
    } catch {
      setLocating(false);
      setLocateError("No se pudo activar la geolocalización");
    }
  }, []);

  const hasFlightLine = outbound?.hasGps && inbound?.hasGps;

  if (mapError) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-center text-sm text-amber-900">
        <p className="font-medium">Mapa no disponible</p>
        <p className="text-xs text-amber-800/80">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 ${
          clickToPlace ? "ring-2 ring-teal-400/50" : ""
        }`}
      />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-50/80 text-sm text-slate-500">
          Cargando mapa Mapbox…
        </div>
      )}
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
        disabled={locating || !mapReady}
        className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
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
        <p className="absolute bottom-14 left-3 z-10 max-w-[240px] rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow ring-1 ring-red-200">
          {locateError}
        </p>
      )}
      {clickToPlace && (
        <p className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-teal-700/90 px-3 py-1 text-xs font-medium text-white shadow">
          Haz clic en el mapa para colocar el pin
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
