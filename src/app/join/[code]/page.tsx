import Link from "next/link";
import JoinTravelForm from "@/components/JoinTravelForm";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function JoinTravelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const travel = await prisma.travel.findUnique({
    where: { shareCode: code },
  });

  if (!travel) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <Link href="/" className="mb-6 inline-block text-sm link-accent">
        ← Inicio
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-fg">{travel.title}</h1>
      <p className="mb-6 text-fg-secondary">
        Código: <span className="font-mono font-semibold">{code}</span>
      </p>

      <section className="surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Únete con tu alias</h2>
        <JoinTravelForm shareCode={code} />
      </section>
    </main>
  );
}
