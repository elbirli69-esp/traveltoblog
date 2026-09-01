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
  /** Open on first landing after creating a past trip */
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
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
            Guía · viaje pasado
          </p>
          <h2 className="mt-1 text-lg font-semibold text-violet-950">
            Reconstruye tu memoria paso a paso
          </h2>
          <p className="mt-1 text-sm text-violet-900/80">
            {progress.complete
              ? "¡Listo! Ya tienes lo esencial para la crónica y el blog."
              : `${progress.done} de ${progress.total} pasos completados`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50"
          >
            {collapsed ? "Expandir" : "Minimizar"}
          </button>
          {progress.complete && (
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
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
                className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  done
                    ? "border-emerald-200 bg-emerald-50/60"
                    : "border-violet-100 bg-white/80"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    <span className="mr-2 text-violet-500">{index + 1}.</span>
                    {done ? "✓ " : ""}
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{step.description}</p>
                </div>
                {!done && (
                  <button
                    type="button"
                    onClick={() =>
                      handleStep(step.id, step.actionKind, step.dayDate)
                    }
                    className="shrink-0 self-start rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 sm:self-auto"
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
          className="mt-3 text-xs text-violet-700/70 underline-offset-2 hover:underline"
        >
          Ocultar guía (puedes seguir añadiendo recuerdos)
        </button>
      )}
    </section>
  );
}
