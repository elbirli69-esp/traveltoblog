"use client";

import { useState } from "react";
import type { PhotoNoteTone } from "@/lib/ai-suggest-photo-note";

const TONES: { id: PhotoNoteTone; label: string }[] = [
  { id: "neutro", label: "Neutro" },
  { id: "divertido", label: "Divertido" },
  { id: "poetico", label: "Poético" },
];

interface SuggestPhotoNoteProps {
  travelId: string;
  photoId: string;
  authorAlias?: string;
  /** True when photo has no place, notes, or EXIF (client hint; server rechecks). */
  sparseHint?: boolean;
  onApplyDraft: (text: string) => void;
}

export default function SuggestPhotoNote({
  travelId,
  photoId,
  authorAlias,
  sparseHint = false,
  onApplyDraft,
}: SuggestPhotoNoteProps) {
  const [tone, setTone] = useState<PhotoNoteTone>("neutro");
  const [forceAi, setForceAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSparse, setConfirmSparse] = useState(false);

  const runSuggest = async (opts?: { forceAi?: boolean }) => {
    const useForce = opts?.forceAi ?? forceAi;
    if (sparseHint && !confirmSparse && !useForce) {
      setError(null);
      setMeta(
        "Poca info en esta foto (sin lugar, notas ni fecha). Marca «Aun así» o usa «Mejorar con IA»."
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
          forceAi: useForce,
          authorAlias,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        suggestion?: string;
        interpretation?: string | null;
        fromAi?: boolean;
        cached?: boolean;
        sparse?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo sugerir la nota");
      }
      setDraft(data.suggestion ?? "");
      const bits: string[] = [];
      if (data.interpretation) bits.push(data.interpretation);
      if (data.cached) bits.push("Desde caché.");
      if (data.fromAi === false && !data.interpretation) {
        bits.push("Sugerencia local (sin IA).");
      }
      setMeta(bits.join(" ") || null);
      if (useForce) setForceAi(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al sugerir");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-secondary">
          Sugerir nota con IA
        </p>
        <p className="text-[11px] text-fg-tertiary">Solo al pulsar · editable</p>
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

      {sparseHint && (
        <label className="flex items-start gap-2 text-xs text-fg-secondary">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmSparse}
            onChange={(e) => setConfirmSparse(e.target.checked)}
            disabled={loading}
          />
          <span>
            Poca info; la sugerencia puede ser genérica. Aun así.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runSuggest()}
          disabled={loading}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {loading ? "Sugiriendo…" : "Sugerir nota"}
        </button>
        {draft != null && (
          <button
            type="button"
            onClick={() => void runSuggest({ forceAi: true })}
            disabled={loading}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Mejorar con IA
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {meta && !error && <p className="text-xs text-fg-tertiary">{meta}</p>}

      {draft != null && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-fg-secondary" htmlFor={`ai-draft-${photoId}`}>
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
