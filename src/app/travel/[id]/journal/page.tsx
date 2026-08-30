import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

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
    },
  });

  if (!travel) notFound();

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
        <article className="prose prose-slate max-w-none whitespace-pre-wrap">
          {travel.journalMarkdown}
        </article>
      ) : (
        <p className="text-slate-500">
          Aún no se ha generado la crónica. Vuelve al viaje y pulsa &ldquo;Generar diario con IA&rdquo;.
        </p>
      )}
    </main>
  );
}
