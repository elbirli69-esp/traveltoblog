"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, rememberTravel } from "@/lib/utils";
import { buildTravelUrlWithPendingShare } from "@/lib/share-client";
import MemoryDateTimeField, { dateTimeToIso } from "@/components/MemoryDateTimeField";
import { todayKey, addDaysToKey } from "@/lib/travel-dates";

type CreateMode = "live" | "past";

export default function CreateTravelForm() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [mode, setMode] = useState<CreateMode | null>(null);
  const [title, setTitle] = useState("");
  const [alias, setAlias] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickMode = (next: CreateMode) => {
    setMode(next);
    setStep(1);
    setError(null);
    if (next === "past" && !startDate) {
      const end = todayKey();
      setEndDate(end);
      setStartDate(addDaysToKey(end, -6));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;

    if (mode === "past") {
      if (!startDate || !endDate) {
        setError("Indica inicio y fin del viaje");
        return;
      }
      if (startDate > endDate) {
        setError("La fecha de fin debe ser posterior al inicio");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, string> = { title, alias, mode };
      if (mode === "past") {
        body.startDate = dateTimeToIso(startDate, "00:00")!;
        body.endDate = dateTimeToIso(endDate, "23:59")!;
      }

      const res = await fetch("/api/travels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      saveSession({
        userId: data.user.id,
        alias: data.user.alias,
        travelId: data.travel.id,
      });
      rememberTravel({
        userId: data.user.id,
        alias: data.user.alias,
        travelId: data.travel.id,
        title: data.travel.title,
        shareCode: data.travel.shareCode,
      });

      const base = buildTravelUrlWithPendingShare(data.travel.id);
      const url =
        mode === "past"
          ? `${base}${base.includes("?") ? "&" : "?"}guide=past`
          : base;
      router.push(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear viaje");
    } finally {
      setLoading(false);
    }
  };

  if (step === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Cómo quieres documentar este viaje?
        </p>
        <button
          type="button"
          onClick={() => pickMode("live")}
          className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left transition hover:border-teal-400 hover:shadow-sm dark:shadow-black/20"
        >
          <p className="font-semibold text-slate-900 dark:text-slate-100">Estoy de viaje ahora</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Fotos y notas en tiempo real. Las fechas se infieren del EXIF y del calendario.
          </p>
        </button>
        <button
          type="button"
          onClick={() => pickMode("past")}
          className="w-full rounded-xl border-2 border-violet-200 bg-violet-50/50 p-4 text-left transition hover:border-violet-400 hover:shadow-sm dark:shadow-black/20"
        >
          <p className="font-semibold text-violet-950">Documentar un viaje pasado</p>
          <p className="mt-1 text-sm text-violet-900/80">
            Reconstruye un viaje ya vivido: defines fechas, subes fotos del álbum y marcas lugares
            con su día real.
          </p>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setMode(null);
          setError(null);
        }}
        className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-200"
      >
        ← Cambiar tipo de viaje
      </button>

      {mode === "past" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900">
          Al crear el viaje te guiaremos paso a paso para ordenar fotos, lugares y notas en el
          calendario correcto.
        </div>
      )}

      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Nombre del viaje
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            mode === "past"
              ? "Ej: Roma con amigos — agosto 2019"
              : "Ej: Road trip por Andalucía 2026"
          }
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      {mode === "past" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MemoryDateTimeField
            label="Primer día del viaje"
            date={startDate}
            onDateChange={setStartDate}
            showTime={false}
          />
          <MemoryDateTimeField
            label="Último día del viaje"
            date={endDate}
            onDateChange={setEndDate}
            showTime={false}
          />
        </div>
      )}

      <div>
        <label htmlFor="alias" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Tu alias
        </label>
        <input
          id="alias"
          type="text"
          required
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Ej: María"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading
          ? "Creando…"
          : mode === "past"
            ? "Crear viaje pasado y empezar guía"
            : "Crear viaje y generar sala"}
      </button>
    </form>
  );
}
