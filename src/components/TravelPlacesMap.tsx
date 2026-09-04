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
  buildDirectRouteGeometry,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  dayKeyFromAt,
  filterGeometryByScope,
  resolveSegmentedRouteGeometry,
  routeDayColor,
  type MapRouteScope,
  type RouteDayLegendEntry,
  type SegmentedRouteGeometry,
} from "@/lib/mapbox-route";
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
  /**
   * Which layers to show. Use "flights" + "local" as two maps when long-haul
   * legs would crush the destination zoom.
   */
  scope?: MapRouteScope;
  /** Compact height for stacked dual maps. */
  compact?: boolean;
  title?: string;
  subtitle?: string;
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
  scope = "all",
  compact = false,
  title,
  subtitle,
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
  const [routeGeometry, setRouteGeometry] = useState<SegmentedRouteGeometry | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const nodes = coalesceRouteNodes(
      buildRouteNodesFromPhotosAndPlaces(
        photos.map((photo) => ({
          latitude: photo.latitude,
          longitude: photo.longitude,
          exifDateTime: photo.exifDateTime,
          isTransportStart: photo.isTransportStart,
          isTransportEnd: photo.isTransportEnd,
        })),
        places.map((place) => ({
          latitude: place.latitude,
          longitude: place.longitude,
          visitedAt: place.visitedAt ?? null,
        }))
      )
    );

    if (nodes.length < 2) {
      setRouteGeometry(null);
      return;
    }

    // Show straight segments immediately (works without ida/vuelta).
    const direct = buildDirectRouteGeometry(nodes);
    setRouteGeometry(direct);

    // Upgrade ground runs to road-following via same-origin Directions proxy.
    void resolveSegmentedRouteGeometry(nodes).then((geometry) => {
      if (!cancelled && geometry) setRouteGeometry(geometry);
    });

    return () => {
      cancelled = true;
    };
  }, [photos, places]);

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

      const accentBlue = getThemeColor("--accent-blue", "#4dabff");
      const accentCyan = getThemeColor("--accent-cyan", "#5de4ff");

      const bounds: [number, number][] = [];
      const scopedGeometry = filterGeometryByScope(routeGeometry, scope);
      const showFlights = scope === "all" || scope === "flights";
      const showLocal = scope === "all" || scope === "local";

      const roadFeatures = (showLocal ? scopedGeometry?.roadSegments ?? [] : [])
        .filter((segment) => segment.coordinates.length > 1)
        .map((segment) => ({
          type: "Feature" as const,
          properties: {
            color: segment.color,
            dayKey: segment.dayKey,
            label: segment.label,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: segment.coordinates.map(
              (point) => [point.lng, point.lat] as [number, number]
            ),
          },
        }));

      const roadCollection = {
        type: "FeatureCollection" as const,
        features: roadFeatures,
      };

      if (map.getSource("photo-route")) {
        (map.getSource("photo-route") as GeoJSONSource).setData(roadCollection);
      } else if (roadFeatures.length > 0) {
        map.addSource("photo-route", { type: "geojson", data: roadCollection });
        map.addLayer({
          id: "photo-route-line",
          type: "line",
          source: "photo-route",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3.5,
            "line-opacity": 0.88,
          },
        });
      }

      const flightCoords = (showFlights ? scopedGeometry?.flightLegs ?? [] : []).map(
        (leg) => leg.map((point) => [point.lng, point.lat] as [number, number])
      );

      const flightFeature = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "MultiLineString" as const,
          coordinates: flightCoords.filter((leg) => leg.length > 1),
        },
      };
      if (map.getSource("flight-route")) {
        (map.getSource("flight-route") as GeoJSONSource).setData(flightFeature);
      } else if (flightFeature.geometry.coordinates.length > 0) {
        map.addSource("flight-route", { type: "geojson", data: flightFeature });
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

      // Include flight leg endpoints in bounds for the flights map.
      if (showFlights) {
        for (const leg of scopedGeometry?.flightLegs ?? []) {
          for (const point of leg) {
            bounds.push([point.lng, point.lat]);
          }
        }
      }

      const chronoPhotos = showLocal
        ? [...routePhotos].sort((a, b) => {
            const aAt = a.exifDateTime
              ? new Date(a.exifDateTime).getTime()
              : Number.POSITIVE_INFINITY;
            const bAt = b.exifDateTime
              ? new Date(b.exifDateTime).getTime()
              : Number.POSITIVE_INFINITY;
            return aAt - bAt;
          })
        : [];

      chronoPhotos.forEach((photo, index) => {
        bounds.push([photo.longitude!, photo.latitude!]);
        const isSelected = photo.id === selectedPhotoId;
        const dayKey = dayKeyFromAt(photo.exifDateTime);
        const dayIndex = dayKey
          ? (scopedGeometry?.dayLegend.find((d) => d.dayKey === dayKey)?.dayIndex ??
            index)
          : index;
        const pinColor = routeDayColor(dayIndex);
        const el = document.createElement("div");
        el.textContent = String(index + 1);
        el.style.width = isSelected ? "22px" : "20px";
        el.style.height = isSelected ? "22px" : "20px";
        el.style.borderRadius = "50%";
        el.style.background = pinColor;
        el.style.color = "#0b1220";
        el.style.fontSize = "10px";
        el.style.fontWeight = "700";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.border = isSelected
          ? `2px solid ${accentCyan}`
          : "2px solid rgba(255,255,255,.85)";
        el.style.boxShadow = "0 1px 4px rgba(0,0,0,.35)";
        el.style.cursor = "pointer";
        el.title = `Parada ${index + 1}`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          handlersRef.current.onPhotoClick?.(photo.id);
        });
        const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
          `<div style="max-width:140px"><img src="${escapeHtml(photo.url)}" alt="" style="width:100%;border-radius:6px;display:block"/><small>#${index + 1} · ${escapeHtml(photo.user.alias)}</small></div>`
        );
        markersRef.current.push(
          new mapboxgl.Marker({ element: el })
            .setLngLat([photo.longitude!, photo.latitude!])
            .setPopup(popup)
            .addTo(map)
        );
      });

      // Place markers continue below
      const addFlight = (
        leg: NonNullable<typeof outbound>,
        emoji: string
      ) => {
        if (!showFlights) return;
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

      for (const place of showLocal ? places : []) {
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

      if (draftPin && showLocal) {
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
          map.fitBounds(b, {
            padding: 48,
            maxZoom: scope === "flights" ? 6 : 14,
            duration: 600,
          });
        } else if (bounds.length === 1) {
          map.easeTo({
            center: bounds[0],
            zoom: scope === "flights" ? 5 : 13,
            duration: 600,
          });
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
    routeGeometry,
    mapReady,
    scope,
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

  const scopedGeometry = filterGeometryByScope(routeGeometry, scope);
  const hasFlightLine =
    (scope === "all" || scope === "flights") &&
    (scopedGeometry?.flightLegs.length ?? 0) > 0;
  const dayLegend: RouteDayLegendEntry[] =
    scope === "flights" ? [] : (scopedGeometry?.dayLegend ?? []);
  const showFlightLegend = scope === "all" || scope === "flights";
  const showLocalLegend = scope === "all" || scope === "local";
  const mapHeight = compact ? "h-[280px]" : "h-[420px]";

  if (mapError) {
    return (
      <div className="callout callout-warning flex h-[420px] flex-col items-center justify-center gap-2 text-center text-sm">
        <p className="font-medium">Mapa no disponible</p>
        <p className="text-xs opacity-90">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-2">
      {(title || subtitle) && (
        <div>
          {title && (
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
          )}
          {subtitle && (
            <p className="mt-0.5 text-xs text-fg-secondary">{subtitle}</p>
          )}
        </div>
      )}
      <div className="relative">
      <div
        ref={containerRef}
        className={`${mapHeight} w-full overflow-hidden rounded-2xl border border-[var(--border)] ${
          clickToPlace ? "ring-2 ring-[var(--accent-cyan)]/40" : ""
        }`}
      />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--card)]/90 text-sm text-fg-secondary">
          Cargando mapa Mapbox…
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[200px] space-y-1 rounded-lg border border-[var(--border)] bg-[var(--card-elevated)]/90 px-2.5 py-2 text-[10px] font-medium text-fg-secondary backdrop-blur-sm">
        {showLocalLegend &&
          dayLegend.map((entry) => (
          <span key={`${entry.dayKey ?? "none"}-${entry.dayIndex}`} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            {entry.label}
          </span>
        ))}
        {showFlightLegend && outbound && (
          <span className="flex items-center gap-1">
            {FLIGHT_OUT_EMOJI} Ida{outbound.hasGps ? "" : " (sin GPS)"}
          </span>
        )}
        {showFlightLegend && inbound && (
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
        {showLocalLegend && routePhotos.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--accent-mint)] text-[8px] font-bold text-[var(--background)]">
              1
            </span>
            Paradas en orden
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
