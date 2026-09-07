import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ExportFormatTabs from "@/components/ExportFormatTabs";
import TravelWorkspaceNav from "@/components/TravelWorkspaceNav";
import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";

function photoThumbApiPath(photoId: string): string {
  return `/api/photos/${photoId}/thumb`;
}

export default async function ExportPage({
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
      journalMarkdown: true,
      photos: {
        where: { selected: true },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          highlightScore: true,
          exifDateTime: true,
          mediaType: true,
          posterFilename: true,
        },
        orderBy: [{ highlightScore: "desc" }, { exifDateTime: "asc" }],
      },
      _count: { select: { photos: { where: { selected: true } } } },
    },
  });

  if (!travel) notFound();

  const hasGpsPhotos = travel.photos.some(
    (p) => p.latitude != null && p.longitude != null
  );

  const coverPhotos = travel.photos
    .filter((p) => p.mediaType !== "VIDEO")
    .map((p) => ({
      id: p.id,
      thumbUrl: photoThumbApiPath(p.id),
      highlightScore: p.highlightScore ?? undefined,
    }));

  const dayCounts = new Map<string, number>();
  for (const photo of travel.photos) {
    if (photo.mediaType === "VIDEO" && !photo.posterFilename) continue;
    if (!photo.exifDateTime) continue;
    const key = isoToDateKey(photo.exifDateTime.toISOString());
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const reelDays = [...dayCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, photoCount]) => ({
      dayKey,
      label: formatDateKey(dayKey, "short"),
      photoCount,
    }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href={`/travel/${travel.id}`} className="text-sm link-accent">
        ← Volver al viaje
      </Link>

      <TravelWorkspaceNav travelId={travel.id} />

      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="heading-page">{travel.title}</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          Elige el formato: diario HTML, álbum PDF o vídeo Reel.
        </p>
      </header>

      <ExportFormatTabs
        travelId={travel.id}
        travelTitle={travel.title}
        hasJournal={Boolean(travel.journalMarkdown)}
        hasGpsPhotos={hasGpsPhotos}
        photoCount={travel._count.photos}
        coverPhotos={coverPhotos}
        reelDays={reelDays}
      />
    </main>
  );
}
