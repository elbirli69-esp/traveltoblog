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
  journalMarkdownPrevious?: string | null;
  journalBrief?: string | null;
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
  journalMarkdownPrevious = null,
  journalBrief = null,
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
      <header className="mb-6 border-b border-[var(--border)] pb-6">
        <h1 className="heading-page">{title}</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          Genera y edita la crónica con IA. Puedes dejar indicaciones libres (tono, anécdotas,
          énfasis) y refinarla en varias pasadas.
        </p>
      </header>

      <section className="surface mb-8 p-6">
        <h2 className="heading-section mb-2 text-accent-cyan">Generar crónica</h2>
        <p className="mb-4 text-sm text-fg-secondary">
          {journalMarkdown
            ? "Refina la crónica existente: conserva tus ediciones, aplica las indicaciones e incorpora notas y fotos nuevas."
            : "Añade indicaciones si quieres, elige el estilo y genera (introducción, días, leyendas y conclusión)."}
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
          hasPreviousJournal={Boolean(journalMarkdownPrevious)}
          initialBrief={journalBrief ?? ""}
        />
      </section>

      {journalMarkdown ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-fg">
              Editar crónica
            </h2>
            <Link
              href={`/travel/${travelId}/export`}
              className="text-sm link-accent"
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
        <p className="surface-inset px-4 py-8 text-center text-sm text-fg-secondary">
          Aún no hay crónica. Completa el checklist si quieres y pulsa «Generar diario con IA».
        </p>
      )}
    </>
  );
}
