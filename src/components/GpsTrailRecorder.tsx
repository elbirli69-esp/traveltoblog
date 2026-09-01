"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface GpsTrailRecorderProps {
  travelId: string;
  userId: string;
  onSaved?: () => void;
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

export default function GpsTrailRecorder({
  travelId,
  userId,
  onSaved,
}: GpsTrailRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const watchId = useRef<number | null>(null);
  const pointsRef = useRef<{ lat: number; lng: number; at: string }[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const lastSampleRef = useRef<number>(0);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);

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
          includeInExport: false,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el recorrido");
      pointsRef.current = [];
      startedAtRef.current = null;
      setPointCount(0);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [stopWatch, travelId, userId, onSaved]);

  return (
    <div className="surface-inset p-4">
      <h3 className="text-sm font-semibold text-fg">Grabar recorrido GPS</h3>
      <p className="mt-1 text-xs text-fg-secondary">
        Opt-in: ~1 punto/min mientras grabas. Consume batería. En iOS el GPS en segundo plano
        puede ser limitado.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={saving}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            ● Grabar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopRecording()}
            disabled={saving}
            className="callout callout-error px-4 py-2 text-sm font-semibold disabled:opacity-50"
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
  );
}
