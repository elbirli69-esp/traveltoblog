import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import JournalWorkspace from "@/components/JournalWorkspace";
import TravelWorkspaceNav from "@/components/TravelWorkspaceNav";

export default async function JournalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const travel = await prisma.travel.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      journalMarkdown: true,
      journalGeneratedAt: true,
      journalMarkdownPrevious: true,
      journalBrief: true,
      photos: {
        select: {
          exifDateTime: true,
          isTransportStart: true,
          isTransportEnd: true,
        },
      },
      notes: {
        where: { type: { in: ["DAY", "TRIP"] } },
        select: { type: true, dayDate: true },
      },
    },
  });

  if (!travel) notFound();

  const dayNotes = travel.notes.filter((n) => n.type === "DAY");
  const tripNoteCount = travel.notes.filter((n) => n.type === "TRIP").length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link
        href={`/travel/${travel.id}`}
        className="text-sm link-accent"
      >
        ← Volver al viaje
      </Link>

      <TravelWorkspaceNav travelId={travel.id} />

      <JournalWorkspace
        travelId={travel.id}
        title={travel.title}
        startDate={travel.startDate?.toISOString() ?? null}
        endDate={travel.endDate?.toISOString() ?? null}
        journalMarkdown={travel.journalMarkdown}
        journalGeneratedAt={travel.journalGeneratedAt?.toISOString() ?? null}
        journalMarkdownPrevious={travel.journalMarkdownPrevious}
        journalBrief={travel.journalBrief}
        photos={travel.photos.map((p) => ({
          exifDateTime: p.exifDateTime?.toISOString() ?? null,
          isTransportStart: p.isTransportStart,
          isTransportEnd: p.isTransportEnd,
        }))}
        dayNotes={dayNotes.map((n) => ({
          dayDate: n.dayDate?.toISOString() ?? null,
        }))}
        tripNoteCount={tripNoteCount}
      />
    </main>
  );
}
