"use client";

import { useEffect, useMemo, useState } from "react";
import type { AddMemoryKind } from "@/components/AddMemorySheet";
import {
  buildPastTripSteps,
  isPastTripCandidate,
  isPastTripStepDone,
  pastTripGuideProgress,
  PAST_GUIDE_DISMISS_KEY,
  type PastTripGuideInput,
} from "@/lib/past-trip-guide";

interface PastTripGuideProps {
  travelId: string;
  input: PastTripGuideInput;
  forceOpen?: boolean;
  onAction: (kind: AddMemoryKind, dayDate?: string) => void;
  onEditDates?: () => void;
}

export default function PastTripGuide({
  travelId,
  input,
  forceOpen = false,
  onAction,
  onEditDates,
}: PastTripGuideProps) {
  const [dismissed, setDismissed] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const steps = useMemo(() => buildPastTripSteps(input), [input]);
  const progress = pastTripGuideProgress(input);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasDismissed = localStorage.getItem(PAST_GUIDE_DISMISS_KEY(travelId)) === "1";
    setDismissed(wasDismissed && !forceOpen);
    if (forceOpen) setCollapsed(false);
  }, [travelId, forceOpen]);

  useEffect(() => {
    if (!forceOpen) return;
    window.history.replaceState({}, "", `/travel/${travelId}`);
  }, [forceOpen, travelId]);

  if (dismissed || !isPastTripCandidate(input)) return null;

  const dismiss = () => {
    localStorage.setItem(PAST_GUIDE_DISMISS_KEY(travelId), "1");
    setDismissed(true);
  };

  const handleStep = (stepId: string, kind: AddMemoryKind | null, dayDate?: string) => {
    if (stepId === "dates") {
      onEditDates?.();
      return;
    }
    if (kind) onAction(kind, dayDate);
  };

  return (
    <section className="guide-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
            Guía · viaje pasado
          </p>
          <h2 className="heading-section mt-1">Reconstruye tu memoria paso a paso</h2>
          <p className="mt-1 text-sm text-fg-secondary">
            {progress.complete
              ? "¡Listo! Ya tienes lo esencial para la crónica y el blog."
              : `${progress.done} de ${progress.total} pasos completados`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {collapsed ? "Expandir" : "Minimizar"}
          </button>
          {progress.complete && (
            <button type="button" onClick={dismiss} className="btn-primary px-3 py-1.5 text-xs">
              Cerrar guía
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <ol className="mt-4 space-y-2">
          {steps.map((step, index) => {
            const done = isPastTripStepDone(step.id, input);
            return (
              <li
                key={step.id}
                className={`guide-step ${done ? "guide-step-done" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">
                    <span className="mr-2 text-accent-blue">{index + 1}.</span>
                    {done ? "✓ " : ""}
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-secondary">{step.description}</p>
                </div>
                {!done && (
                  <button
                    type="button"
                    onClick={() => handleStep(step.id, step.actionKind, step.dayDate)}
                    className="btn-primary shrink-0 self-start px-3 py-2 text-xs sm:self-auto"
                  >
                    {step.actionLabel}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!progress.complete && !collapsed && (
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 text-xs text-fg-tertiary underline-offset-2 hover:text-accent-cyan hover:underline"
        >
          Ocultar guía (puedes seguir añadiendo recuerdos)
        </button>
      )}
    </section>
  );
}
