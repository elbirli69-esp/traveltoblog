import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import JournalWorkspace from "@/components/JournalWorkspace";
import TravelWorkspaceNav from "@/components/TravelWorkspaceNav";
import { blogCompletenessInputFromTravel } from "@/lib/blog-completeness-from-travel";

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
      destinationName: true,
      destinationThemes: true,
      photos: {
        select: {
          id: true,
          selected: true,
          exifDateTime: true,
          latitude: true,
          longitude: true,
          placeId: true,
          highlightScore: true,
          isTransportStart: true,
          isTransportEnd: true,
          notes: {
            where: { type: "PHOTO" },
            select: { type: true, text: true },
          },
        },
      },
      places: {
        select: {
          type: true,
          notes: {
            where: { type: "PLACE" },
            select: { text: true },
          },
        },
      },
      notes: {
        where: { type: { in: ["DAY", "TRIP", "PLACE"] } },
        select: { type: true, dayDate: true, text: true },
      },
    },
  });

  if (!travel) notFound();

  const dayNotes = travel.notes.filter((n) => n.type === "DAY");
  const tripNoteCount = travel.notes.filter((n) => n.type === "TRIP").length;

  const blogCompleteness = blogCompletenessInputFromTravel({
    title: travel.title,
    journalBrief: travel.journalBrief,
    destinationName: travel.destinationName,
    destinationThemes: travel.destinationThemes,
    startDate: travel.startDate?.toISOString() ?? null,
    endDate: travel.endDate?.toISOString() ?? null,
    photos: travel.photos.map((p) => ({
      id: p.id,
      selected: p.selected,
      exifDateTime: p.exifDateTime?.toISOString() ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      placeId: p.placeId,
      highlightScore: p.highlightScore,
      isTransportStart: p.isTransportStart,
      isTransportEnd: p.isTransportEnd,
      notes: p.notes,
    })),
    places: travel.places.map((pl) => ({
      type: pl.type,
      notes: pl.notes,
    })),
    notes: travel.notes.map((n) => ({
      type: n.type,
      text: n.text,
      dayDate: n.dayDate?.toISOString() ?? null,
    })),
  });

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
        blogCompleteness={blogCompleteness}
      />
    </main>
  );
}
