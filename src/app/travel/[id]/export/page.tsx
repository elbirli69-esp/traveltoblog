import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import ExportReelPanel from "@/components/ExportReelPanel";
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
      <Link
        href={`/travel/${travel.id}`}
        className="text-sm link-accent"
      >
        ← Volver al viaje
      </Link>

      <TravelWorkspaceNav travelId={travel.id} />

      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="heading-page">{travel.title}</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          Exporta el viaje como HTML interactivo, Reel de Instagram o PDF para imprenta.
        </p>
      </header>

      <section className="surface p-6">
        <h2 className="heading-section mb-1 text-accent-mint">Exportar viaje</h2>
        <p className="mb-5 text-sm text-fg-secondary">
          Diario HTML interactivo con cronología, mapa sincronizado, tipología de viaje y modo
          reproducir.
        </p>
        <ExportHtmlPanel
          travelId={travel.id}
          hasJournal={Boolean(travel.journalMarkdown)}
          hasGpsPhotos={hasGpsPhotos}
        />
      </section>

      <section className="surface p-6">
        <h2 className="heading-section mb-1 text-accent-cyan">Reel para Instagram</h2>
        <p className="mb-5 text-sm text-fg-secondary">
          ZIP independiente con un vídeo resumen vertical listo para publicar como Reel (sin
          mezclar con el ZIP del HTML).
        </p>
        <ExportReelPanel
          travelId={travel.id}
          travelTitle={travel.title}
          photoCount={travel._count.photos}
        />
      </section>

      <section className="surface p-6">
        <h2 className="heading-section mb-1 text-accent-blue">Álbum para imprenta</h2>
        <p className="mb-5 text-sm text-fg-secondary">
          PDF maquetado para imprenta profesional (A4 horizontal o cuadrado 21×21 cm). Listo para
          Saal Digital, CEWE u otra imprenta.
        </p>
        <ExportPdfPanel
          travelId={travel.id}
          hasJournal={Boolean(travel.journalMarkdown)}
          photoCount={travel._count.photos}
          coverPhotos={coverPhotos}
        />
      </section>
    </main>
  );
}
