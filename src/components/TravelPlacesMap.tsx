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
import { computeMapCenter, placeEmoji, isGeolocationSecureContext, buildTravelRoutePoints } from "@/lib/places";
import {
  createEmojiMarkerElement,
  loadMapbox,
  resolveMapboxStyle,
  MAPBOX_TOKEN,
} from "@/lib/mapbox";
import { getThemeColor } from "@/lib/theme";
import type { GeoJSONSource, Map as MapboxMap, Marker, GeolocateControl } from "mapbox-gl";

export interface MapPlace {
  id: string;
  name: string;
  type: PlaceType;
  latitude: number;
  longitude: number;
  visitedAt?: string | null;
  comment?: string | null;
  notes?: { text: string }[];
}

interface TravelPlacesMapProps {
  places: MapPlace[];
  photos: FlightLegPhoto[];
  selectedPlaceId: string | null;
  selectedPhotoId?: string | null;
  addMode: boolean;
  /** When true, map clicks place the draft pin (DogTrainer "Elegir en mapa"). */
  clickToPlace?: boolean;
  /** Increment to trigger Mapbox GeolocateControl (DogTrainer "Mi ubicación"). */
  locateSignal?: number;
  draftPin: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onPlaceClick: (id: string) => void;
  onPhotoClick?: (id: string) => void;
}

export default function TravelPlacesMap({
  places,
  photos,
  selectedPlaceId,
  selectedPhotoId = null,
  addMode,
  clickToPlace = false,
  locateSignal = 0,
  draftPin,
  onMapClick,
  onPlaceClick,
  onPhotoClick,
}: TravelPlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const geolocateRef = useRef<GeolocateControl | null>(null);
  const handlersRef = useRef({
    onMapClick,
    onPlaceClick,
    onPhotoClick,
    addMode,
    clickToPlace,
  });
  const skipAutoFitRef = useRef(false);
  const placesCountRef = useRef(places.length);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  handlersRef.current = {
    onMapClick,
    onPlaceClick,
    onPhotoClick,
    addMode,
    clickToPlace,
  };

  const { outbound, inbound } = resolveFlightLegs(photos);
  const routePhotos = photoGpsPoints(photos);
  const routePoints = buildTravelRoutePoints(photos, places);

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
          style: resolveMapboxStyle(),
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

      const accentMint = getThemeColor("--accent-mint", "#3dffb8");
      const accentBlue = getThemeColor("--accent-blue", "#4dabff");
      const accentCyan = getThemeColor("--accent-cyan", "#5de4ff");
      const fgTertiary = getThemeColor("--foreground-tertiary", "#6b7a8f");

      const bounds: [number, number][] = [];

      const routeCoords = routePoints.map(
        (p) => [p.longitude, p.latitude] as [number, number]
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
            "line-color": accentMint,
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
            "line-color": accentBlue,
            "line-width": 3,
            "line-opacity": 0.9,
            "line-dasharray": [2, 1.5],
          },
        });
      }

      for (const photo of routePhotos) {
        bounds.push([photo.longitude!, photo.latitude!]);
        const isSelected = photo.id === selectedPhotoId;
        const el = document.createElement("div");
        el.style.width = isSelected ? "14px" : "10px";
        el.style.height = isSelected ? "14px" : "10px";
        el.style.borderRadius = "50%";
        el.style.background = isSelected ? accentMint : fgTertiary;
        el.style.border = isSelected ? `2px solid ${accentCyan}` : `1px solid ${fgTertiary}`;
        el.style.cursor = "pointer";
        el.title = "Ver foto";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          handlersRef.current.onPhotoClick?.(photo.id);
        });
        const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
          `<div style="max-width:140px"><img src="${escapeHtml(photo.url)}" alt="" style="width:100%;border-radius:6px;display:block"/><small>${escapeHtml(photo.user.alias)}</small></div>`
        );
        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([photo.longitude!, photo.latitude!])
            .setPopup(popup)
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
        const placeNote =
          place.notes?.map((n) => n.text).filter(Boolean).join(" · ") ||
          place.comment?.trim() ||
          "";
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<strong>${escapeHtml(place.name)}</strong>${placeNote ? `<br>${escapeHtml(placeNote)}` : ""}`
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
    selectedPhotoId,
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
      <div className="callout callout-warning flex h-[420px] flex-col items-center justify-center gap-2 text-center text-sm">
        <p className="font-medium">Mapa no disponible</p>
        <p className="text-xs opacity-90">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`h-[420px] w-full overflow-hidden rounded-2xl border border-[var(--border)] ${
          clickToPlace ? "ring-2 ring-[var(--accent-cyan)]/40" : ""
        }`}
      />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--card)]/90 text-sm text-fg-secondary">
          Cargando mapa Mapbox…
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--card-elevated)]/90 px-2.5 py-2 text-[10px] font-medium text-fg-secondary backdrop-blur-sm">
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
          <span className="flex items-center gap-1 text-accent-cyan">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[var(--accent-blue)]" />
            Trayecto aéreo
          </span>
        )}
        {routePoints.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t-2 border-[var(--accent-mint)]" />
            Recorrido (fotos y lugares)
          </span>
        )}
        {routePhotos.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--foreground-tertiary)]" />
            Fotos GPS (toca)
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={locateUser}
        disabled={locating || !mapReady}
        className="map-overlay-btn absolute bottom-3 left-3 z-10 disabled:opacity-60"
        aria-label="Centrar mapa en mi ubicación"
      >
        {locating ? (
          <>
            <span className="spinner-accent h-3.5 w-3.5" />
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
        <p className="callout callout-error absolute bottom-14 left-3 z-10 max-w-[240px] text-xs font-medium shadow">
          {locateError}
        </p>
      )}
      {clickToPlace && (
        <p className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--accent-cyan)] bg-[var(--card-elevated)]/95 px-3 py-1 text-xs font-medium text-accent-cyan shadow">
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
