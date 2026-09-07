"use client";

import { useState } from "react";
import { DAY_SUMMARY_SEED_MIN_CHARS } from "@/lib/ai-suggest-day-summary";

interface SuggestDaySummaryProps {
  travelId: string;
  dayKey: string;
  authorAlias?: string;
  /** Own DAY note for this day (append target). */
  ownDayNote?: { id: string; text: string } | null;
  onApplyDraft: (text: string) => void;
  onAppended?: () => void;
}

export default function SuggestDaySummary({
  travelId,
  dayKey,
  authorAlias,
  ownDayNote = null,
  onApplyDraft,
  onAppended,
}: SuggestDaySummaryProps) {
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [appending, setAppending] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seedReady = seed.trim().length >= DAY_SUMMARY_SEED_MIN_CHARS;

  const runSuggest = async () => {
    if (!seedReady) {
      setError(
        `Cuenta el día en al menos ${DAY_SUMMARY_SEED_MIN_CHARS} caracteres; la IA solo complementa con lugares, fotos y notas.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const res = await fetch("/api/ai/suggest-day-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          dayKey,
          authorAlias,
          userSeed: seed.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        suggestion?: string;
        interpretation?: string | null;
        fromAi?: boolean;
        cached?: boolean;
        empty?: boolean;
        sources?: { placeCount: number; noteCount: number; photoCount: number };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo completar el resumen");
      }
      setDraft(data.suggestion ?? "");
      const bits: string[] = [];
      if (data.interpretation) bits.push(data.interpretation);
      if (data.sources) {
        bits.push(
          `Datos del día: ${data.sources.photoCount} fotos, ${data.sources.placeCount} lugares, ${data.sources.noteCount} notas.`
        );
      }
      if (data.cached) bits.push("Desde caché.");
      setMeta(bits.join(" ") || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al completar");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  const appendToOwnNote = async () => {
    if (!ownDayNote || !draft?.trim()) return;
    setAppending(true);
    setError(null);
    try {
      const merged = `${ownDayNote.text.trim()}\n\n${draft.trim()}`;
      const res = await fetch(`/api/notes/${ownDayNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: merged }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo actualizar la nota");
      }
      setDraft(null);
      setMeta("Añadido al final de tu nota del día.");
      onAppended?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al añadir");
    } finally {
      setAppending(false);
    }
  };

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-secondary">
          Completar resumen del día con IA
        </p>
        <p className="text-[11px] text-fg-tertiary">
          Tú cuentas · lugares/notas del día · editable
        </p>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-fg-secondary"
          htmlFor={`ai-day-seed-${dayKey}`}
        >
          Qué pasó este día (breve)
        </label>
        <textarea
          id={`ai-day-seed-${dayKey}`}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          rows={2}
          placeholder="Ej. Mañana en el casco antiguo, tarde de museo y cena tranquila"
          className="form-input input-focus text-sm"
          disabled={loading}
        />
        <p className="mt-1 text-[11px] text-fg-tertiary">
          Mínimo {DAY_SUMMARY_SEED_MIN_CHARS} caracteres. La IA añade lugares,
          fotos y notas ya registradas — sin inventar el día.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void runSuggest()}
        disabled={loading || !seedReady}
        className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {loading ? "Completando…" : "Completar con IA"}
      </button>

      {error && <p className="text-xs text-danger">{error}</p>}
      {meta && !error && <p className="text-xs text-fg-tertiary">{meta}</p>}

      {draft != null && (
        <div className="space-y-2">
          <label
            className="text-xs font-medium text-fg-secondary"
            htmlFor={`ai-day-draft-${dayKey}`}
          >
            Borrador
          </label>
          <textarea
            id={`ai-day-draft-${dayKey}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="form-input input-focus text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={!draft.trim()}
              onClick={() => {
                onApplyDraft(draft.trim());
                setDraft(null);
                setMeta("Insertado en el formulario. Revisa y guarda.");
              }}
            >
              Insertar en el formulario
            </button>
            {ownDayNote && (
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                disabled={!draft.trim() || appending}
                onClick={() => void appendToOwnNote()}
              >
                {appending ? "Añadiendo…" : "Añadir al final de mi nota"}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(draft);
                  setMeta("Copiado al portapapeles.");
                } catch {
                  setMeta("No se pudo copiar.");
                }
              }}
            >
              Copiar
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => {
                setDraft(null);
                setMeta(null);
                setError(null);
              }}
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
