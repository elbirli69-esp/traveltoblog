import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import TravelWorkspaceNav from "@/components/TravelWorkspaceNav";

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
        select: { latitude: true, longitude: true },
      },
      _count: { select: { photos: { where: { selected: true } } } },
    },
  });

  if (!travel) notFound();

  const hasGpsPhotos = travel.photos.some(
    (p) => p.latitude != null && p.longitude != null
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link
        href={`/travel/${travel.id}`}
        className="text-sm text-teal-600 hover:underline"
      >
        ← Volver al viaje
      </Link>

      <TravelWorkspaceNav travelId={travel.id} />

      <header className="border-b border-slate-200 dark:border-slate-800 pb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{travel.title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Exporta el viaje como HTML interactivo o PDF para imprenta.
        </p>
      </header>

      <section className="rounded-2xl border border-teal-100 bg-teal-50/40 p-6 dark:border-teal-900/40 dark:bg-teal-950/20">
        <h2 className="mb-1 text-lg font-semibold text-teal-900 dark:text-teal-100">
          Exportar viaje
        </h2>
        <p className="mb-5 text-sm text-teal-800/80 dark:text-teal-200/80">
          Diario HTML interactivo con cronología, mapa sincronizado, tipología de viaje y modo
          reproducir.
        </p>
        <ExportHtmlPanel
          travelId={travel.id}
          hasJournal={Boolean(travel.journalMarkdown)}
          hasGpsPhotos={hasGpsPhotos}
        />
      </section>

      <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-6 dark:border-violet-900/40 dark:bg-violet-950/20">
        <h2 className="mb-1 text-lg font-semibold text-violet-900 dark:text-violet-100">
          Álbum para imprenta
        </h2>
        <p className="mb-5 text-sm text-violet-800/80 dark:text-violet-200/80">
          PDF maquetado para imprenta profesional (A4 horizontal o cuadrado 21×21 cm). Listo para
          Saal Digital, CEWE u otra imprenta.
        </p>
        <ExportPdfPanel
          travelId={travel.id}
          hasJournal={Boolean(travel.journalMarkdown)}
          photoCount={travel._count.photos}
        />
      </section>
    </main>
  );
}
