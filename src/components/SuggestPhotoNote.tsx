"use client";

import { useState } from "react";
import {
  PHOTO_NOTE_SEED_MIN_CHARS,
  type PhotoNoteTone,
} from "@/lib/ai-suggest-photo-note";

const TONES: { id: PhotoNoteTone; label: string }[] = [
  { id: "neutro", label: "Neutro" },
  { id: "divertido", label: "Divertido" },
  { id: "poetico", label: "Poético" },
];

interface SuggestPhotoNoteProps {
  travelId: string;
  photoId: string;
  authorAlias?: string;
  onApplyDraft: (text: string) => void;
}

export default function SuggestPhotoNote({
  travelId,
  photoId,
  authorAlias,
  onApplyDraft,
}: SuggestPhotoNoteProps) {
  const [tone, setTone] = useState<PhotoNoteTone>("neutro");
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seedReady = seed.trim().length >= PHOTO_NOTE_SEED_MIN_CHARS;

  const runSuggest = async () => {
    if (!seedReady) {
      setError(
        `Describe la foto en al menos ${PHOTO_NOTE_SEED_MIN_CHARS} caracteres; la IA solo complementa lo que escribas.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const res = await fetch("/api/ai/suggest-photo-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          photoId,
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
      setError(err instanceof Error ? err.message : "Error al completar");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-secondary">
          Completar nota con IA
        </p>
        <p className="text-[11px] text-fg-tertiary">
          Tú describes · la IA pulirá · editable
        </p>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-fg-secondary"
          htmlFor={`ai-seed-${photoId}`}
        >
          Qué hay en la foto (breve)
        </label>
        <textarea
          id={`ai-seed-${photoId}`}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          rows={2}
          placeholder="Ej. Café en terraza con vistas al río, lluvia ligera"
          className="form-input input-focus text-sm"
          disabled={loading}
        />
        <p className="mt-1 text-[11px] text-fg-tertiary">
          Mínimo {PHOTO_NOTE_SEED_MIN_CHARS} caracteres. Sin esto, la IA no inventa la escena.
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
          disabled={loading || !seedReady}
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
            htmlFor={`ai-draft-${photoId}`}
          >
            Borrador
          </label>
          <textarea
            id={`ai-draft-${photoId}`}
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
