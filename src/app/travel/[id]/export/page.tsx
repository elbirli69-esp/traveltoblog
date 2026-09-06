import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ExportFormatTabs from "@/components/ExportFormatTabs";
import TravelWorkspaceNav from "@/components/TravelWorkspaceNav";

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
        where: { selected: true, mediaType: { not: "VIDEO" } },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          highlightScore: true,
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

  const coverPhotos = travel.photos.map((p) => ({
    id: p.id,
    thumbUrl: photoThumbApiPath(p.id),
    highlightScore: p.highlightScore ?? undefined,
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
      />
    </main>
  );
}
