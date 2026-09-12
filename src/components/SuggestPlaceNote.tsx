"use client";

import { useEffect, useState } from "react";
import {
  PLACE_NOTE_SEED_MIN_CHARS,
  type PlaceNoteTone,
} from "@/lib/ai-suggest-place-note";
import {
  appendSeedStarter,
  photoSeedPlaceholder,
  photoSeedStarters,
} from "@/lib/blog-seed-prompts";

const TONES: { id: PlaceNoteTone; label: string }[] = [
  { id: "neutro", label: "Neutro" },
  { id: "divertido", label: "Divertido" },
  { id: "poetico", label: "Poético" },
];

interface SuggestPlaceNoteProps {
  travelId: string;
  /** Saved place id — preferred. */
  placeId?: string | null;
  /** Required when drafting a new place (no id yet). */
  placeName: string;
  placeType?: string | null;
  authorAlias?: string;
  /** Prefill seed from draft textarea / last note. */
  initialSeed?: string;
  lastPlaceNoteText?: string | null;
  onApplyDraft: (text: string) => void;
}

export default function SuggestPlaceNote({
  travelId,
  placeId = null,
  placeName,
  placeType = null,
  authorAlias,
  initialSeed = "",
  lastPlaceNoteText = null,
  onApplyDraft,
}: SuggestPlaceNoteProps) {
  const [tone, setTone] = useState<PlaceNoteTone>("neutro");
  const [seed, setSeed] = useState(initialSeed);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSeed.trim() && !seed.trim()) {
      setSeed(initialSeed);
    }
    // Only sync when parent bumps a fresh draft seed intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeed]);

  const seedReady = seed.trim().length >= PLACE_NOTE_SEED_MIN_CHARS;
  const nameReady = placeName.trim().length > 0;
  const starters = photoSeedStarters(placeType);
  const lastNote = lastPlaceNoteText?.trim() || null;

  const runSuggest = async () => {
    if (!nameReady) {
      setError("Pon primero el nombre del lugar; la IA lo usa como ancla.");
      return;
    }
    if (!seedReady) {
      setError(
        `Escribe al menos ${PLACE_NOTE_SEED_MIN_CHARS} caracteres; la IA solo complementa lo que digas.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const res = await fetch("/api/ai/suggest-place-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          placeId: placeId || undefined,
          placeName: placeName.trim(),
          placeType: placeType || undefined,
          tone,
          userSeed: seed.trim(),
          authorAlias,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        suggestion?: string;
        interpretation?: string | null;
        fromAi?: boolean;
        cached?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo completar la nota");
      }
      setDraft(data.suggestion ?? "");
      const bits: string[] = [];
      if (data.interpretation) bits.push(data.interpretation);
      if (data.cached) bits.push("Desde caché.");
      if (data.fromAi === false && !data.interpretation) {
        bits.push("Versión local (sin IA).");
      }
      setMeta(bits.join(" ") || null);
    } catch (err) {
      const { describeFetchError } = await import("@/lib/fetch-error");
      setError(describeFetchError(err, "Error al completar con IA"));
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-secondary">
          Completar nota del lugar con IA
        </p>
        <p className="text-[11px] text-fg-tertiary">
          Usa «{placeName.trim() || "…"}» + tu texto · editable
        </p>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-fg-secondary"
          htmlFor={`ai-place-seed-${placeId || "draft"}`}
        >
          Qué quieres contar del lugar (breve)
        </label>
        <div
          className="mb-1.5 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Ideas para empezar"
        >
          {starters.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeed((prev) => appendSeedStarter(prev, s.text))}
              className="chip-btn text-[11px]"
              disabled={loading}
            >
              {s.label}
            </button>
          ))}
          {lastNote && (
            <button
              type="button"
              onClick={() => setSeed(lastNote)}
              className="chip-btn text-[11px]"
              disabled={loading}
              title="Copia otra nota de lugar como punto de partida"
            >
              Usar última nota
            </button>
          )}
        </div>
        <textarea
          id={`ai-place-seed-${placeId || "draft"}`}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          rows={2}
          placeholder={photoSeedPlaceholder(placeType)}
          className="form-input input-focus text-sm"
          disabled={loading}
        />
        <p className="mt-1 text-[11px] text-fg-tertiary">
          Mínimo {PLACE_NOTE_SEED_MIN_CHARS} caracteres. La IA tiene en cuenta el
          nombre del lugar y puede añadir una curiosidad cultural — sin inventar
          lo que hicisteis.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tono">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTone(t.id)}
            className={`chip-btn text-xs ${
              tone === t.id
                ? "border-[var(--accent-cyan)] font-semibold text-fg"
                : ""
            }`}
            aria-pressed={tone === t.id}
            disabled={loading}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runSuggest()}
          disabled={loading || !seedReady || !nameReady}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {loading ? "Completando…" : "Completar con IA"}
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {meta && !error && <p className="text-xs text-fg-tertiary">{meta}</p>}

      {draft != null && (
        <div className="space-y-2">
          <label
            className="text-xs font-medium text-fg-secondary"
            htmlFor={`ai-place-draft-${placeId || "draft"}`}
          >
            Borrador
          </label>
          <textarea
            id={`ai-place-draft-${placeId || "draft"}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
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
                setMeta("Insertado en el formulario de nota. Revisa y guarda.");
              }}
            >
              Insertar en el formulario
            </button>
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
