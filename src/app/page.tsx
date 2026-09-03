import Link from "next/link";
import CreateTravelForm from "@/components/CreateTravelForm";
import RecentTravels from "@/components/RecentTravels";
import PendingShareBanner from "@/components/PendingShareBanner";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <header className="mb-10 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-mint)] to-[var(--accent-cyan)] text-3xl shadow-lg">
          ✈️
        </div>
        <h1 className="heading-page text-3xl">TravelToBlog</h1>
        <p className="mt-2 text-fg-secondary">
          Diario colaborativo de viajes con fotos, notas e IA
        </p>
      </header>

      <PendingShareBanner />

      <RecentTravels />

      <section className="surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Nuevo viaje</h2>
        <CreateTravelForm />
      </section>

      <p className="mt-6 text-center text-sm text-fg-tertiary">
        ¿Tienes un código?{" "}
        <Link href="/join" className="link-accent">
          Unirte a un viaje
        </Link>
      </p>

      <footer className="mt-12 space-y-2 text-center text-xs text-fg-tertiary">
        <p>
          <Link href="/download/android" className="link-accent">
            App Android (GPS en fotos)
          </Link>
        </p>
        <p>PWA · Offline-first · Self-hosted</p>
      </footer>
    </main>
  );
}
