"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import GenerateJournalButton from "@/components/GenerateJournalButton";
import JournalEditor from "@/components/JournalEditor";
import JournalReadinessChecklist from "@/components/JournalReadinessChecklist";
import type { ReadinessActionKind } from "@/lib/journal-readiness";

interface JournalWorkspaceProps {
  travelId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  journalMarkdown: string | null;
  journalGeneratedAt: string | null;
  photos: {
    exifDateTime: string | null;
    isTransportStart: boolean;
    isTransportEnd: boolean;
  }[];
  dayNotes: { dayDate: string | null }[];
  tripNoteCount: number;
}

export default function JournalWorkspace({
  travelId,
  title,
  startDate,
  endDate,
  journalMarkdown,
  journalGeneratedAt,
  photos,
  dayNotes,
  tripNoteCount,
}: JournalWorkspaceProps) {
  const router = useRouter();

  const handleFix = (kind: ReadinessActionKind, dayDate?: string) => {
    const params = new URLSearchParams({ add: kind });
    if (dayDate) params.set("date", dayDate);
    router.push(`/travel/${travelId}?${params.toString()}`);
  };

  return (
    <>
      <header className="mb-6 border-b border-slate-200 dark:border-slate-800 pb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Genera y edita la crónica del viaje con IA. Las notas, fotos y fechas del viaje son la
          materia prima.
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 dark:border-indigo-900/50 dark:bg-indigo-950/30">
        <h2 className="mb-2 text-lg font-semibold text-indigo-900 dark:text-indigo-100">
          Generar crónica
        </h2>
        <p className="mb-4 text-sm text-indigo-800/80 dark:text-indigo-200/80">
          Elige el estilo y genera un artículo en varios pasos: introducción, resumen por día,
          leyendas de fotos y conclusión.
        </p>
        <JournalReadinessChecklist
          startDate={startDate}
          endDate={endDate}
          photos={photos}
          dayNotes={dayNotes}
          tripNoteCount={tripNoteCount}
          onFix={handleFix}
        />
        <GenerateJournalButton
          travelId={travelId}
          hasExistingJournal={Boolean(journalMarkdown)}
        />
      </section>

      {journalMarkdown ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Editar crónica
            </h2>
            <Link
              href={`/travel/${travelId}/export`}
              className="text-sm font-medium text-teal-600 hover:underline"
            >
              Exportar viaje →
            </Link>
          </div>
          <JournalEditor
            travelId={travelId}
            initialMarkdown={journalMarkdown}
            generatedAt={journalGeneratedAt}
          />
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Aún no hay crónica. Completa el checklist si quieres y pulsa «Generar diario con IA».
        </p>
      )}
    </>
  );
}
