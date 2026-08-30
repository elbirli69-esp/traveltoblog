import Link from "next/link";

export default function JoinIndexPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Unirse a un viaje</h1>
      <p className="mb-6 text-slate-500">
        Introduce el código que te compartió el organizador del viaje en la URL:
      </p>
      <p className="rounded-xl bg-slate-100 px-4 py-3 font-mono text-sm text-slate-600">
        /join/<span className="text-teal-600">tu-codigo</span>
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-teal-600 hover:underline"
      >
        ← Volver al inicio
      </Link>
    </main>
  );
}
