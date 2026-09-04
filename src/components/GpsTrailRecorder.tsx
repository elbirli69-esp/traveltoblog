"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface GpsTrailRecorderProps {
  travelId: string;
  userId: string;
  onSaved?: () => void;
}

interface SavedTrack {
  id: string;
  startedAt: string;
  endedAt: string | null;
  pointCount: number;
  includeInExport: boolean;
  alias: string;
}

const SAMPLE_MS = 60_000;
const MIN_MOVE_M = 15;

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatTrackWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GpsTrailRecorder({
  travelId,
  userId,
  onSaved,
}: GpsTrailRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [includeInExport, setIncludeInExport] = useState(true);
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const pointsRef = useRef<{ lat: number; lng: number; at: string }[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const lastSampleRef = useRef<number>(0);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);

  const loadTracks = useCallback(async () => {
    setTracksLoading(true);
    try {
      const res = await fetch(`/api/travels/${travelId}/gps-tracks`);
      if (!res.ok) throw new Error("fail");
      const data = (await res.json()) as { tracks?: SavedTrack[] };
      setTracks(data.tracks ?? []);
    } catch {
      /* keep previous list */
    } finally {
      setTracksLoading(false);
    }
  }, [travelId]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  const stopWatch = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  useEffect(() => () => stopWatch(), [stopWatch]);

  const addPoint = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    const last = lastPointRef.current;
    if (last && distanceM(last.lat, last.lng, lat, lng) < MIN_MOVE_M) {
      if (now - lastSampleRef.current < SAMPLE_MS) return;
    }
    lastSampleRef.current = now;
    lastPointRef.current = { lat, lng };
    pointsRef.current.push({ lat, lng, at: new Date().toISOString() });
    setPointCount(pointsRef.current.length);
  }, []);

  const startRecording = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalización no disponible en este navegador");
      return;
    }
    setError(null);
    pointsRef.current = [];
    startedAtRef.current = new Date().toISOString();
    setPointCount(0);
    setRecording(true);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        addPoint(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setError(err.message || "Error de GPS");
        setRecording(false);
        stopWatch();
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );
  }, [addPoint, stopWatch]);

  const stopRecording = useCallback(async () => {
    stopWatch();
    setRecording(false);
    if (pointsRef.current.length === 0 || !startedAtRef.current) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}/gps-tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          startedAt: startedAtRef.current,
          endedAt: new Date().toISOString(),
          points: pointsRef.current,
          includeInExport,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el recorrido");
      pointsRef.current = [];
      startedAtRef.current = null;
      setPointCount(0);
      await loadTracks();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [stopWatch, travelId, userId, includeInExport, loadTracks, onSaved]);

  const toggleExport = async (track: SavedTrack) => {
    setBusyTrackId(track.id);
    setError(null);
    try {
      const res = await fetch(`/api/gps-tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInExport: !track.includeInExport }),
      });
      if (!res.ok) throw new Error("fail");
      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, includeInExport: !t.includeInExport } : t
        )
      );
      onSaved?.();
    } catch {
      setError("No se pudo actualizar el recorrido");
    } finally {
      setBusyTrackId(null);
    }
  };

  const deleteTrack = async (track: SavedTrack) => {
    const ok = window.confirm("¿Eliminar este recorrido GPS?");
    if (!ok) return;
    setBusyTrackId(track.id);
    setError(null);
    try {
      const res = await fetch(`/api/gps-tracks/${track.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("fail");
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      onSaved?.();
    } catch {
      setError("No se pudo eliminar el recorrido");
    } finally {
      setBusyTrackId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface-inset p-4">
        <h3 className="text-sm font-semibold text-fg">Grabar recorrido GPS</h3>
        <p className="mt-1 text-xs text-fg-secondary">
          Opt-in: ~1 punto/min mientras grabas. Consume batería. En iOS el GPS en segundo plano
          es limitado; deja la app abierta si puedes.
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-fg-secondary">
          <input
            type="checkbox"
            checked={includeInExport}
            onChange={(e) => setIncludeInExport(e.target.checked)}
            disabled={recording || saving}
            className="accent-theme"
          />
          Incluir en el mapa del export (HTML/PDF) al guardar
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={saving}
              className="btn-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              ▶ Empezar a grabar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void stopRecording()}
              className="btn-secondary px-3 py-1.5 text-xs font-semibold"
            >
              ■ Parar y guardar
            </button>
          )}
          {recording && (
            <span className="text-sm text-accent-cyan animate-pulse">
              Grabando… {pointCount} puntos
            </span>
          )}
          {saving && <span className="text-sm text-fg-secondary">Guardando…</span>}
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>

      <div className="surface-inset p-4">
        <h3 className="text-sm font-semibold text-fg">Recorridos guardados</h3>
        <p className="mt-1 text-xs text-fg-secondary">
          Activa «En export» para dibujar el trail en el mapa HTML/PDF (línea punteada). También
          puedes marcar «Incluir recorridos GPS» en la pantalla de export HTML.
        </p>
        {tracksLoading ? (
          <p className="mt-3 text-xs text-fg-secondary">Cargando…</p>
        ) : tracks.length === 0 ? (
          <p className="mt-3 text-xs text-fg-secondary">Aún no hay recorridos grabados.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-fg">
                    {track.alias} · {track.pointCount} punto
                    {track.pointCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-fg-secondary">
                    {formatTrackWhen(track.startedAt)}
                    {track.endedAt ? ` → ${formatTrackWhen(track.endedAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busyTrackId === track.id}
                    onClick={() => void toggleExport(track)}
                    className={`chip-btn text-[11px] disabled:opacity-50 ${
                      track.includeInExport ? "tag-mint" : ""
                    }`}
                    title="Incluir o quitar del mapa export"
                  >
                    {track.includeInExport ? "En export" : "Sin export"}
                  </button>
                  <button
                    type="button"
                    disabled={busyTrackId === track.id}
                    onClick={() => void deleteTrack(track)}
                    className="text-xs font-medium text-danger disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
