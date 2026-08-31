import Link from "next/link";
import CreateTravelForm from "@/components/CreateTravelForm";
import RecentTravels from "@/components/RecentTravels";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <header className="mb-10 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 text-3xl text-white shadow-lg">
          ✈️
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          TravelToBlog
        </h1>
        <p className="mt-2 text-slate-500">
          Diario colaborativo de viajes con fotos, notas e IA
        </p>
      </header>

      <RecentTravels />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Nuevo viaje</h2>
        <CreateTravelForm />
      </section>

      <p className="mt-6 text-center text-sm text-slate-400">
        ¿Tienes un código?{" "}
        <Link href="/join" className="font-medium text-teal-600 hover:underline">
          Unirte a un viaje
        </Link>
      </p>

      <footer className="mt-12 space-y-2 text-center text-xs text-slate-400">
        <p>
          <Link href="/download/android" className="font-medium text-teal-600 hover:underline">
            App Android (GPS en fotos)
          </Link>
        </p>
        <p>PWA · Offline-first · Self-hosted</p>
      </footer>
    </main>
  );
}
