"use client";

import { useState } from "react";
import MemoryDateTimeField, { dateTimeToIso, isoToDateAndTime } from "@/components/MemoryDateTimeField";
import { isoToDateKey } from "@/lib/travel-dates";

interface TravelDatesPanelProps {
  travelId: string;
  startDate: string | null;
  endDate: string | null;
  onSaved?: () => void;
  /** When false, panel starts collapsed if dates exist */
  defaultOpen?: boolean;
  id?: string;
}

export default function TravelDatesPanel({
  travelId,
  startDate,
  endDate,
  onSaved,
  defaultOpen,
  id = "travel-dates-panel",
}: TravelDatesPanelProps) {
  const start = isoToDateAndTime(startDate);
  const end = isoToDateAndTime(endDate);

  const [startKey, setStartKey] = useState(start.date);
  const [endKey, setEndKey] = useState(end.date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(
    defaultOpen ?? (!startDate && !endDate)
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: startKey ? dateTimeToIso(startKey, "00:00") : null,
          endDate: endKey ? dateTimeToIso(endKey, "23:59") : null,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      setOpen(false);
      onSaved?.();
    } catch {
      setError("Error al guardar las fechas del viaje");
    } finally {
      setSaving(false);
    }
  };

  const rangeLabel =
    startDate && endDate
      ? `${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(startDate))} — ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(endDate))}`
      : startDate
        ? `Desde ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(startDate))}`
        : "Sin fechas definidas";

  return (
    <section
      id={id}
      className="surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">Fechas del viaje</h2>
          <p className="mt-0.5 text-xs text-fg-secondary">
            Útil para viajes pasados: define el calendario aunque subas fotos hoy.
          </p>
          {!open && <p className="mt-2 text-sm text-fg-secondary">{rangeLabel}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-slate-50 dark:hover:bg-slate-800/60 dark:bg-slate-950/60"
        >
          {open ? "Cerrar" : "Editar fechas"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <MemoryDateTimeField
              label="Inicio del viaje"
              date={startKey || (startDate ? isoToDateKey(startDate) : "")}
              onDateChange={setStartKey}
              showTime={false}
              hint="Primer día del viaje"
            />
            <MemoryDateTimeField
              label="Fin del viaje"
              date={endKey || (endDate ? isoToDateKey(endDate) : "")}
              onDateChange={setEndKey}
              showTime={false}
              hint="Último día del viaje"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar fechas"}
          </button>
        </div>
      )}
    </section>
  );
}
