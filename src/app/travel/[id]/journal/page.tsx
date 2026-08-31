import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";

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
      journalMarkdown: true,
      journalGeneratedAt: true,
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/travel/${travel.id}`}
        className="text-sm text-teal-600 hover:underline"
      >
        ← Volver al viaje
      </Link>

      <header className="my-6 border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold text-slate-900">{travel.title}</h1>
        {travel.journalGeneratedAt && (
          <p className="mt-1 text-sm text-slate-400">
            Generado el{" "}
            {new Intl.DateTimeFormat("es-ES", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(travel.journalGeneratedAt)}
          </p>
        )}
      </header>

      {travel.journalMarkdown ? (
        <article className="prose prose-slate mb-10 max-w-none whitespace-pre-wrap">
          {travel.journalMarkdown}
        </article>
      ) : (
        <p className="mb-10 text-slate-500">
          Aún no se ha generado la crónica. Vuelve al viaje y pulsa &ldquo;Generar diario con IA&rdquo;.
        </p>
      )}

      <section className="rounded-2xl border border-teal-100 bg-teal-50/40 p-6">
        <h2 className="mb-1 text-lg font-semibold text-teal-900">
          Exportar viaje
        </h2>
        <p className="mb-5 text-sm text-teal-800/80">
          Genera un paquete HTML estático con tu crónica, fotos y mapa interactivo
          del recorrido. Listo para publicar o archivar sin depender de la PWA.
        </p>
        <ExportHtmlPanel
          travelId={travel.id}
          hasJournal={Boolean(travel.journalMarkdown)}
          hasGpsPhotos={hasGpsPhotos}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/40 p-6">
        <h2 className="mb-1 text-lg font-semibold text-violet-900">
          Álbum para imprenta
        </h2>
        <p className="mb-5 text-sm text-violet-800/80">
          PDF maquetado con portada, doble columna (fotos + narrativa) y metadatos EXIF.
          Listo para Saal Digital, CEWE u otra imprenta.
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
