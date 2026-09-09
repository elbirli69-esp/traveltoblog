"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BlogCompletenessPanel from "@/components/BlogCompletenessPanel";
import GenerateJournalButton from "@/components/GenerateJournalButton";
import JournalEditor from "@/components/JournalEditor";
import JournalReadinessChecklist from "@/components/JournalReadinessChecklist";
import type { BlogCompletenessInput, BlogGapActionKind } from "@/lib/blog-completeness";
import type { ReadinessActionKind } from "@/lib/journal-readiness";
import {
  JOURNAL_KIND_LABELS,
  type JournalKind,
} from "@/lib/journal-kind";

interface JournalWorkspaceProps {
  travelId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  journalMarkdown: string | null;
  journalGeneratedAt: string | null;
  journalMarkdownPrevious?: string | null;
  journalBlogMarkdown?: string | null;
  journalBlogGeneratedAt?: string | null;
  journalBlogMarkdownPrevious?: string | null;
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
  journalBlogMarkdown = null,
  journalBlogGeneratedAt = null,
  journalBlogMarkdownPrevious = null,
  journalBrief = null,
  photos,
  dayNotes,
  tripNoteCount,
  blogCompleteness,
}: JournalWorkspaceProps) {
  const router = useRouter();
  const [kind, setKind] = useState<JournalKind>(
    journalBlogMarkdown && !journalMarkdown ? "blog" : "day"
  );

  const activeMarkdown = kind === "blog" ? journalBlogMarkdown : journalMarkdown;
  const activeGeneratedAt =
    kind === "blog" ? journalBlogGeneratedAt : journalGeneratedAt;
  const activePrevious =
    kind === "blog" ? journalBlogMarkdownPrevious : journalMarkdownPrevious;

  const goTravel = (query: Record<string, string>) => {
    const params = new URLSearchParams(query);
    router.push(`/travel/${travelId}?${params.toString()}`);
  };

  const handleReadinessFix = (kindAction: ReadinessActionKind, dayDate?: string) => {
    const params: Record<string, string> = { add: kindAction };
    if (dayDate) params.date = dayDate;
    goTravel(params);
  };

  const handleBlogFix = (
    gapKind: BlogGapActionKind,
    opts?: { dayDate?: string; photoId?: string }
  ) => {
    if (gapKind === "journal_brief") {
      document.getElementById("journal-brief")?.focus();
      return;
    }
    if (gapKind === "photos_notes" || gapKind === "photos_highlight") {
      const q: Record<string, string> = { tab: "photos" };
      if (opts?.photoId) q.photo = opts.photoId;
      if (gapKind === "photos_notes") q.unnoted = "1";
      goTravel(q);
      return;
    }
    if (gapKind === "place" || gapKind === "place_food") {
      goTravel({
        add: "place",
        ...(gapKind === "place_food" ? { placeType: "RESTAURANT" } : {}),
      });
      return;
    }
    if (gapKind === "day") {
      goTravel({
        add: "day",
        ...(opts?.dayDate ? { date: opts.dayDate } : {}),
      });
      return;
    }
    if (gapKind === "trip") {
      goTravel({ add: "trip" });
      return;
    }
    if (gapKind === "destination_fiche") {
      goTravel({ tab: "trip", focus: "destination" });
    }
  };

  return (
    <>
      <header className="mb-6 border-b border-[var(--border)] pb-6">
        <h1 className="heading-page">{title}</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          Genera y edita dos crónicas independientes: por días (diario/recuerdo) o artículo
          blog (para compartir con quien planea un viaje similar). El export HTML elige cuál
          usar.
        </p>
      </header>

      <div
        className="mb-6 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tipo de crónica"
      >
        {(Object.keys(JOURNAL_KIND_LABELS) as JournalKind[]).map((id) => {
          const meta = JOURNAL_KIND_LABELS[id];
          const selected = kind === id;
          const hasText =
            id === "blog" ? Boolean(journalBlogMarkdown) : Boolean(journalMarkdown);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setKind(id)}
              className={`option-radio max-w-xs text-left ${
                selected ? "option-radio-active" : ""
              }`}
            >
              <span className="block text-sm font-semibold text-fg">
                {meta.title}
                {hasText ? (
                  <span className="ml-1.5 text-xs font-normal text-accent-cyan">· lista</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-fg-secondary">{meta.description}</span>
            </button>
          );
        })}
      </div>

      <section className="surface mb-8 p-6">
        <h2 className="heading-section mb-2 text-accent-cyan">
          {kind === "blog" ? "Generar artículo blog" : "Generar crónica por días"}
        </h2>
        <p className="mb-4 text-sm text-fg-secondary">
          {activeMarkdown
            ? kind === "blog"
              ? "Refina el artículo blog: conserva tus ediciones e incorpora notas y fotos nuevas."
              : "Refina la crónica por días: conserva tus ediciones e incorpora notas y fotos nuevas."
            : kind === "blog"
              ? "Artículo continuo con tips «Si vas» — pensado para quien planea un viaje similar."
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
          kind={kind}
          hasExistingJournal={Boolean(activeMarkdown)}
          hasPreviousJournal={Boolean(activePrevious)}
          initialBrief={journalBrief ?? ""}
        />
      </section>

      {activeMarkdown ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-fg">
              {kind === "blog" ? "Editar artículo blog" : "Editar crónica por días"}
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
            kind={kind}
            initialMarkdown={activeMarkdown}
            generatedAt={activeGeneratedAt}
          />
        </section>
      ) : (
        <p className="text-sm text-fg-secondary">
          Aún no hay texto en esta pestaña. Genera con IA o cambia a la otra crónica si ya
          existe.
        </p>
      )}
    </>
  );
}
