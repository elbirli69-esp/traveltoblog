"use client";

import { useEffect, useState } from "react";
import {
  DESTINATION_NAME_MAX,
  DESTINATION_THEME_MAX,
  DESTINATION_THEME_SUGGESTIONS,
  normalizeDestinationThemes,
  parseDestinationThemesJson,
} from "@/lib/destination-fiche";

interface DestinationFichePanelProps {
  travelId: string;
  destinationName?: string | null;
  destinationThemes?: string | null;
  onSaved?: () => void;
  /** Scroll/focus target for completeness CTA */
  id?: string;
  defaultOpen?: boolean;
}

export default function DestinationFichePanel({
  travelId,
  destinationName = null,
  destinationThemes = null,
  onSaved,
  id = "destination-fiche",
  defaultOpen,
}: DestinationFichePanelProps) {
  const initialThemes = parseDestinationThemesJson(destinationThemes);
  const [name, setName] = useState(destinationName ?? "");
  const [themes, setThemes] = useState<string[]>(initialThemes);
  const [themeDraft, setThemeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [open, setOpen] = useState(
    defaultOpen ?? Boolean(destinationName?.trim() || initialThemes.length)
  );

  useEffect(() => {
    setName(destinationName ?? "");
    setThemes(parseDestinationThemesJson(destinationThemes));
  }, [destinationName, destinationThemes]);

  const addTheme = (raw: string) => {
    const next = normalizeDestinationThemes([...themes, raw]);
    setThemes(next);
    setThemeDraft("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedHint(null);
    try {
      const res = await fetch(`/api/travels/${travelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationName: name.trim() || null,
          destinationThemes: themes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar");
      }
      setSavedHint("Ficha destino guardada.");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id={id} className="form-panel space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <p className="form-panel-title">Ficha destino (opcional)</p>
          <p className="text-xs text-fg-tertiary">
            Nombre canónico + 1–3 temas para curiosidades de blog más coherentes.
          </p>
        </div>
        <span className="text-xs text-fg-tertiary">{open ? "Ocultar" : "Mostrar"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-divider pt-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-secondary">
              Destino
            </span>
            <input
              type="text"
              value={name}
              maxLength={DESTINATION_NAME_MAX}
              onChange={(e) => setName(e.target.value.slice(0, DESTINATION_NAME_MAX))}
              placeholder="Ej. Cracovia, Polonia"
              className="form-input w-full text-sm"
              disabled={saving}
            />
          </label>

          <div>
            <p className="mb-1.5 text-sm font-medium text-fg-secondary">
              Temas (máx. {DESTINATION_THEME_MAX})
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {DESTINATION_THEME_SUGGESTIONS.map((s) => {
                const on = themes.some(
                  (t) => t.toLowerCase() === s.toLowerCase()
                );
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={saving || (!on && themes.length >= DESTINATION_THEME_MAX)}
                    onClick={() => {
                      if (on) {
                        setThemes((prev) =>
                          prev.filter((t) => t.toLowerCase() !== s.toLowerCase())
                        );
                      } else {
                        addTheme(s);
                      }
                    }}
                    className={`chip-btn text-[11px] ${
                      on ? "border-[var(--accent-cyan)] font-semibold text-fg" : ""
                    }`}
                    aria-pressed={on}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {themes.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {themes.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      className="chip-btn text-[11px]"
                      onClick={() =>
                        setThemes((prev) => prev.filter((x) => x !== t))
                      }
                      disabled={saving}
                    >
                      {t} ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={themeDraft}
                onChange={(e) => setThemeDraft(e.target.value.slice(0, 80))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (themeDraft.trim()) addTheme(themeDraft);
                  }
                }}
                placeholder="Otro tema…"
                className="form-input flex-1 text-sm"
                disabled={saving || themes.length >= DESTINATION_THEME_MAX}
              />
              <button
                type="button"
                className="btn-secondary px-3 text-xs"
                disabled={
                  saving ||
                  !themeDraft.trim() ||
                  themes.length >= DESTINATION_THEME_MAX
                }
                onClick={() => addTheme(themeDraft)}
              >
                Añadir
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar ficha"}
          </button>
          {savedHint && (
            <p className="text-xs text-fg-tertiary">{savedHint}</p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
