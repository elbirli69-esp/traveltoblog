"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JournalPipelineEvent } from "@/lib/journal-pipeline";

const STEP_LABELS: Record<string, string> = {
  context: "Preparando datos",
  intro: "Introducción",
  days: "Resúmenes por día",
  captions: "Leyendas de fotos",
  conclusion: "Conclusión",
  assemble: "Ensamblando artículo",
  complete: "Listo",
};

export default function GenerateJournalButton({ travelId }: { travelId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const handleGenerate = async () => {
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
        body: JSON.stringify({ travelId, stream: true }),
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
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Generando crónica…" : "✨ Generar diario con IA"}
      </button>

      {loading && (
        <ul className="space-y-1.5 rounded-xl bg-indigo-50/80 px-4 py-3 text-xs text-indigo-900">
          {Object.entries(STEP_LABELS).map(([key, label]) => {
            if (key === "complete") return null;
            const done = completedSteps.includes(key);
            const active = currentStep === key;
            return (
              <li
                key={key}
                className={`flex items-center gap-2 ${
                  done ? "text-teal-700" : active ? "font-semibold" : "text-indigo-400"
                }`}
              >
                <span>{done ? "✓" : active ? "…" : "○"}</span>
                {label}
              </li>
            );
          })}
          {stepMessage && (
            <li className="font-medium text-indigo-700">{stepMessage}</li>
          )}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {warning && !loading && (
        <p className="text-sm text-amber-700">{warning}</p>
      )}
    </div>
  );
}
