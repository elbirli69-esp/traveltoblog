"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  JOURNAL_STYLE_LABELS,
  type JournalPipelineEvent,
  type JournalStyle,
} from "@/lib/journal-pipeline";

const STEP_LABELS: Record<string, string> = {
  context: "Preparando datos",
  intro: "Introducción",
  days: "Resúmenes por día",
  captions: "Leyendas de fotos",
  conclusion: "Conclusión",
  assemble: "Ensamblando artículo",
  complete: "Listo",
};

export default function GenerateJournalButton({
  travelId,
  hasExistingJournal = false,
}: {
  travelId: string;
  hasExistingJournal?: boolean;
}) {
  const router = useRouter();
  const [style, setStyle] = useState<JournalStyle>("factual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const handleGenerate = async () => {
    if (hasExistingJournal) {
      const ok = confirm(
        "Ya hay una crónica guardada (puede incluir ediciones manuales). Regenerar la sobrescribirá. ¿Continuar?"
      );
      if (!ok) return;
    }

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
        body: JSON.stringify({ travelId, stream: true, style }),
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
            router.push(`/travel/${travelId}/journal`);
            router.refresh();
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar");
    } finally {
      setLoading(false);
      setCurrentStep(null);
    }
  };

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2" disabled={loading}>
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

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary w-full py-3 text-sm disabled:opacity-50"
      >
        {loading
          ? "Generando crónica…"
          : hasExistingJournal
            ? "✨ Regenerar diario con IA"
            : "✨ Generar diario con IA"}
      </button>

      {loading && (
        <ul className="progress-panel space-y-1.5">
          {Object.entries(STEP_LABELS).map(([key, label]) => {
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
              </li>
            );
          })}
          {stepMessage && (
            <li className="progress-step-active font-medium">{stepMessage}</li>
          )}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {warning && !loading && <p className="callout callout-warning text-sm">{warning}</p>}
    </div>
  );
}
