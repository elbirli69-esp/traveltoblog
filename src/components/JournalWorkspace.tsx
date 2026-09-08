"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BlogCompletenessPanel from "@/components/BlogCompletenessPanel";
import GenerateJournalButton from "@/components/GenerateJournalButton";
import JournalEditor from "@/components/JournalEditor";
import JournalReadinessChecklist from "@/components/JournalReadinessChecklist";
import type { BlogCompletenessInput, BlogGapActionKind } from "@/lib/blog-completeness";
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
  blogCompleteness: BlogCompletenessInput;
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
  blogCompleteness,
}: JournalWorkspaceProps) {
  const router = useRouter();

  const goTravel = (query: Record<string, string>) => {
    const params = new URLSearchParams(query);
    router.push(`/travel/${travelId}?${params.toString()}`);
  };

  const handleReadinessFix = (kind: ReadinessActionKind, dayDate?: string) => {
    const params: Record<string, string> = { add: kind };
    if (dayDate) params.date = dayDate;
    goTravel(params);
  };

  const handleBlogFix = (
    kind: BlogGapActionKind,
    opts?: { dayDate?: string; photoId?: string }
  ) => {
    if (kind === "journal_brief") {
      document.getElementById("journal-brief")?.focus();
      return;
    }
    if (kind === "photos_notes" || kind === "photos_highlight") {
      const q: Record<string, string> = { tab: "photos" };
      if (opts?.photoId) q.photo = opts.photoId;
      if (kind === "photos_notes") q.unnoted = "1";
      goTravel(q);
      return;
    }
    if (kind === "place" || kind === "place_food") {
      goTravel({
        add: "place",
        ...(kind === "place_food" ? { placeType: "RESTAURANT" } : {}),
      });
      return;
    }
    if (kind === "day") {
      goTravel({
        add: "day",
        ...(opts?.dayDate ? { date: opts.dayDate } : {}),
      });
      return;
    }
    if (kind === "trip") {
      goTravel({ add: "trip" });
      return;
    }
    if (kind === "destination_fiche") {
      goTravel({ tab: "trip", focus: "destination" });
    }
  };

  return (
    <>
      <header className="mb-6 border-b border-[var(--border)] pb-6">
        <h1 className="heading-page">{title}</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          Genera y edita la crónica con IA. Puedes dejar indicaciones libres (tono, anécdotas,
          énfasis) y refinarla en varias pasadas. La IA enriquecerá con historia y costumbres
          del destino ancladas a vuestros lugares — sin inventar visitas.
        </p>
      </header>

      <section className="surface mb-8 p-6">
        <h2 className="heading-section mb-2 text-accent-cyan">Generar crónica</h2>
        <p className="mb-4 text-sm text-fg-secondary">
          {journalMarkdown
            ? "Refina la crónica existente: conserva tus ediciones, aplica las indicaciones e incorpora notas y fotos nuevas."
            : "Añade indicaciones si quieres, elige el estilo y genera (introducción, días, leyendas y conclusión)."}
        </p>
        <BlogCompletenessPanel
          input={blogCompleteness}
          onFix={handleBlogFix}
        />
        <JournalReadinessChecklist
          startDate={startDate}
          endDate={endDate}
          photos={photos}
          dayNotes={dayNotes}
          tripNoteCount={tripNoteCount}
          onFix={handleReadinessFix}
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
