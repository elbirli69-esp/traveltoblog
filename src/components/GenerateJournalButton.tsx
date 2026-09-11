"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  JOURNAL_STYLE_LABELS,
  type JournalPipelineEvent,
  type JournalStyle,
} from "@/lib/journal-pipeline";
import type { JournalKind } from "@/lib/journal-kind";
import {
  activeJournalIntentions,
  JOURNAL_INTENTION_CHIPS,
  toggleJournalIntention,
  type JournalIntentionId,
} from "@/lib/blog-seed-prompts";

const GENERATE_STEP_LABELS: Record<string, string> = {
  context: "Preparando datos",
  intro: "Introducción",
  days: "Secciones / días",
  captions: "Leyendas de fotos",
  conclusion: "Conclusión",
  assemble: "Ensamblando artículo",
  complete: "Listo",
};

const GENERATE_STEP_LABELS_BLOG: Record<string, string> = {
  context: "Preparando datos",
  intro: "Introducción",
  days: "Secciones temáticas",
  captions: "Leyendas de fotos",
  conclusion: "Cierre «Si vas»",
  assemble: "Ensamblando artículo",
  complete: "Listo",
};

const REFINE_STEP_LABELS: Record<string, string> = {
  context: "Preparando datos",
  refine: "Refinando crónica existente",
  complete: "Listo",
};

export default function GenerateJournalButton({
  travelId,
  hasExistingJournal = false,
  hasPreviousJournal = false,
  initialBrief = "",
  kind = "day",
  availableDays = [],
}: {
  travelId: string;
  hasExistingJournal?: boolean;
  hasPreviousJournal?: boolean;
  initialBrief?: string;
  kind?: JournalKind;
  /** Calendar days available for single-day generation (kind=day). */
  availableDays?: { dayKey: string; label: string }[];
}) {
  const router = useRouter();
  const [style, setStyle] = useState<JournalStyle>("narrative");
  const [brief, setBrief] = useState(initialBrief);
  const [loading, setLoading] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(hasPreviousJournal);
  const [activeMode, setActiveMode] = useState<"refine" | "fresh" | null>(null);
  const [dayScope, setDayScope] = useState<string>("all");

  useEffect(() => {
    setCanUndo(hasPreviousJournal);
  }, [hasPreviousJournal]);

  useEffect(() => {
    setBrief(initialBrief);
  }, [initialBrief]);

  const stepLabels =
    activeMode === "refine"
      ? REFINE_STEP_LABELS
      : kind === "blog"
        ? GENERATE_STEP_LABELS_BLOG
        : GENERATE_STEP_LABELS;

  const handleGenerate = async (mode: "refine" | "fresh") => {
    const scopedDay = kind === "day" && dayScope !== "all" ? dayScope : null;
    if (mode === "refine" && hasExistingJournal) {
      const ok = confirm(
        scopedDay
          ? `La IA refinará solo el día ${scopedDay}: conservará ediciones de ese capítulo e incorporará notas/fotos nuevas. Se guarda copia para deshacer. ¿Continuar?`
          : kind === "blog"
            ? "La IA refinará el artículo blog actual: conservará tus ediciones e incorporará notas/fotos nuevas y tus indicaciones. Se guarda una copia para poder deshacer. ¿Continuar?"
            : "La IA refinará la crónica actual: conservará tus ediciones e incorporará notas/fotos nuevas y tus indicaciones. Se guarda una copia para poder deshacer. ¿Continuar?"
      );
      if (!ok) return;
    }
    if (mode === "fresh" && hasExistingJournal) {
      const ok = confirm(
        scopedDay
          ? `Se generará de nuevo el capítulo del ${scopedDay} (el resto de la crónica se conserva). Se guarda copia para deshacer. ¿Continuar?`
          : kind === "blog"
            ? "Se generará un artículo blog NUEVO desde cero (estructura temática nueva). El texto actual se guarda para poder deshacer. ¿Continuar?"
            : "Se generará una crónica NUEVA desde cero. El texto actual se guarda para poder deshacer. ¿Continuar?"
      );
      if (!ok) return;
    }

    setActiveMode(mode);
    setLoading(true);
    setError(null);
    setWarning(null);
    setCurrentStep(null);
    setStepMessage(null);
    setCompletedSteps([]);

    try {
      const res = await fetch("/api/generate-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          stream: true,
          style,
          brief: brief.trim() || null,
          kind,
          mode,
          ...(scopedDay ? { dayKey: scopedDay } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al generar");
      }

      if (!res.body) throw new Error("Sin respuesta del servidor");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as JournalPipelineEvent;

          if (event.step === "error") {
            throw new Error(event.message ?? "Error en el pipeline");
          }

          if (event.status === "running") {
            setCurrentStep(event.step);
            setStepMessage(event.message ?? null);
          }

          if (event.status === "done" && event.step !== "complete") {
            setCompletedSteps((prev) =>
              prev.includes(event.step) ? prev : [...prev, event.step]
            );
          }

          if (event.step === "complete" && event.status === "done") {
            if (event.message?.includes("sin IA")) {
              setWarning(event.message);
            }
            if (hasExistingJournal) {
              setCanUndo(true);
            }
            router.push(`/travel/${travelId}/journal`);
            router.refresh();
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar");
    } finally {
      setLoading(false);
      setActiveMode(null);
      setCurrentStep(null);
    }
  };

  const handleUndo = async () => {
    const ok = confirm(
      "¿Restaurar la versión anterior a la última regeneración? La crónica actual se guarda por si quieres volver."
    );
    if (!ok) return;

    setUndoBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}/journal/restore-previous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo deshacer");
      }
      setCanUndo(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al deshacer");
    } finally {
      setUndoBusy(false);
    }
  };

  const activeIntentions = activeJournalIntentions(brief);

  const toggleIntention = (id: JournalIntentionId) => {
    setBrief((prev) => toggleJournalIntention(prev, id).slice(0, 4000));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="journal-brief" className="block text-sm font-medium text-accent-cyan">
          Indicaciones para la IA{" "}
          <span className="font-normal text-fg-secondary">(opcional)</span>
        </label>
        <div
          className="mb-1.5 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Enfoque editorial"
        >
          {JOURNAL_INTENTION_CHIPS.map((chip) => {
            const on = activeIntentions.includes(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => toggleIntention(chip.id)}
                disabled={loading || undoBusy}
                aria-pressed={on}
                className={`chip-btn text-xs ${
                  on ? "border-[var(--accent-cyan)] font-semibold text-fg" : ""
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <textarea
          id="journal-brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value.slice(0, 4000))}
          disabled={loading || undoBusy}
          rows={4}
          placeholder="Anécdotas, énfasis o tono. Ej.: Cuenta lo de la tormenta en la playa; tono cercano, sin frases grandilocuentes; dale más peso al último día."
          className="form-input w-full resize-y text-sm"
        />
        <p className="text-xs text-fg-secondary">
          Los chips se guardan en el brief del viaje y guían el tono al generar o
          refinar. {brief.length}/4000
        </p>
      </div>

      <fieldset className="space-y-2" disabled={loading || undoBusy}>
        <legend className="mb-2 text-sm font-medium text-accent-cyan">
          Estilo de la crónica
        </legend>
        {(Object.keys(JOURNAL_STYLE_LABELS) as JournalStyle[]).map((key) => {
          const option = JOURNAL_STYLE_LABELS[key];
          const selected = style === key;
          return (
            <label
              key={key}
              className={`option-radio ${selected ? "option-radio-active" : ""}`}
            >
              <input
                type="radio"
                name="journal-style"
                value={key}
                checked={selected}
                onChange={() => setStyle(key)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">{option.title}</span>
                <span className="block text-xs text-fg-secondary">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {kind === "day" && availableDays.length > 0 && (
        <div className="space-y-1.5">
          <label
            htmlFor="journal-day-scope"
            className="block text-sm font-medium text-accent-cyan"
          >
            Alcance
          </label>
          <select
            id="journal-day-scope"
            value={dayScope}
            onChange={(e) => setDayScope(e.target.value)}
            disabled={loading || undoBusy}
            className="form-input w-full text-sm"
          >
            <option value="all">Todo el viaje</option>
            {availableDays.map((d) => (
              <option key={d.dayKey} value={d.dayKey}>
                Solo {d.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-fg-secondary">
            Elige un día para generar o refinar solo ese capítulo mientras el viaje
            sigue en curso.
          </p>
        </div>
      )}

      {hasExistingJournal ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleGenerate("refine")}
            disabled={loading || undoBusy}
            className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
          >
            {loading && activeMode === "refine"
              ? kind === "blog"
                ? "Refinando artículo…"
                : "Refinando crónica…"
              : kind === "blog"
                ? "✨ Refinar artículo blog"
                : "✨ Refinar crónica"}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate("fresh")}
            disabled={loading || undoBusy}
            className="btn-secondary flex-1 py-3 text-sm disabled:opacity-50"
          >
            {loading && activeMode === "fresh"
              ? kind === "blog"
                ? "Generando artículo nuevo…"
                : "Generando crónica nueva…"
              : kind === "blog"
                ? "Generar artículo de nuevo"
                : "Generar crónica de nuevo"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleGenerate("fresh")}
          disabled={loading || undoBusy}
          className="btn-primary w-full py-3 text-sm disabled:opacity-50"
        >
          {loading
            ? kind === "blog"
              ? "Generando artículo…"
              : "Generando crónica…"
            : kind === "blog"
              ? "✨ Generar artículo blog con IA"
              : "✨ Generar diario con IA"}
        </button>
      )}

      {hasExistingJournal && (
        <p className="text-xs text-fg-secondary">
          <strong className="font-semibold text-fg">Refinar</strong> parte del texto
          actual e incorpora material nuevo.{" "}
          <strong className="font-semibold text-fg">Generar de nuevo</strong> crea
          otra crónica desde cero (misma IA + notas/fotos). En ambos casos se guarda
          copia para deshacer.
        </p>
      )}

      {canUndo && (
        <button
          type="button"
          onClick={() => void handleUndo()}
          disabled={loading || undoBusy}
          className="btn-secondary w-full py-2 text-sm disabled:opacity-50"
        >
          {undoBusy ? "Restaurando…" : "↩ Deshacer última regeneración"}
        </button>
      )}

      {loading && (
        <ul className="progress-panel space-y-1.5">
          {Object.entries(stepLabels).map(([key, label]) => {
            if (key === "complete") return null;
            const done = completedSteps.includes(key);
            const active = currentStep === key;
            return (
              <li
                key={key}
                className={`flex items-center gap-2 ${
                  done
                    ? "progress-step-done"
                    : active
                      ? "progress-step-active"
                      : "progress-step-pending"
                }`}
              >
                <span>{done ? "✓" : active ? "…" : "○"}</span>
                {label}
                {active && stepMessage ? (
                  <span className="text-xs text-fg-tertiary">— {stepMessage}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {warning && <p className="text-sm text-amber-200">{warning}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
