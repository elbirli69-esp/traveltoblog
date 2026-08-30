"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PhotoUploadSection from "@/components/PhotoUploadSection";
import SharePanel from "@/components/SharePanel";
import NoteForm from "@/components/NoteForm";
import OfflineSyncBanner from "@/components/OfflineSyncBanner";
import GenerateJournalButton from "@/components/GenerateJournalButton";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import { getSessionFromStorage } from "@/lib/utils";
import type { TravelDateRange } from "@/types";

interface TravelData {
  id: string;
  title: string;
  shareCode: string;
  startDate: string | null;
  endDate: string | null;
  users: { id: string; alias: string }[];
  photos: {
    id: string;
    url: string;
    exifDateTime: string | null;
    latitude: number | null;
    longitude: number | null;
    selected: boolean;
    user: { alias: string };
  }[];
  notes: {
    id: string;
    text: string;
    type: string;
    user: { alias: string };
  }[];
  journalMarkdown: string | null;
}

export default function TravelPage({ params }: { params: Promise<{ id: string }> }) {
  const [travelId, setTravelId] = useState<string | null>(null);
  const [travel, setTravel] = useState<TravelData | null>(null);
  const [session, setSession] = useState<ReturnType<typeof getSessionFromStorage>>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    params.then((p) => setTravelId(p.id));
    setSession(getSessionFromStorage());
  }, [params]);

  const loadTravel = useCallback(async () => {
    if (!travelId) return;
    const res = await fetch(`/api/travels/${travelId}`);
    if (res.ok) {
      const data = await res.json();
      setTravel(data.travel);
    }
  }, [travelId]);

  useEffect(() => {
    loadTravel();
  }, [loadTravel, refreshKey]);

  if (!travelId || !travel) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-slate-500">Cargando viaje…</p>
      </main>
    );
  }

  if (!session || session.travelId !== travelId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="mb-4 text-slate-600">
          Necesitas unirte a este viaje con tu alias primero.
        </p>
        <Link
          href={`/join/${travel.shareCode}`}
          className="rounded-xl bg-teal-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Unirme
        </Link>
      </main>
    );
  }

  const dateRange: TravelDateRange = {
    start: travel.startDate ? new Date(travel.startDate) : null,
    end: travel.endDate ? new Date(travel.endDate) : null,
  };

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header>
        <Link href="/" className="text-sm text-teal-600 hover:underline">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{travel.title}</h1>
        <p className="text-sm text-slate-500">
          {travel.users.length} participante{travel.users.length !== 1 ? "s" : ""}:{" "}
          {travel.users.map((u) => u.alias).join(", ")}
        </p>
      </header>

      <OfflineSyncBanner
        travelId={travelId}
        userId={session.userId}
        onSynced={() => setRefreshKey((k) => k + 1)}
      />

      <SharePanel shareCode={travel.shareCode} title={travel.title} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <PhotoUploadSection
          travelId={travelId}
          userId={session.userId}
          userAlias={session.alias}
          dateRange={dateRange}
          onSyncComplete={() => setRefreshKey((k) => k + 1)}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Notas</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <NoteForm
            travelId={travelId}
            userId={session.userId}
            type="PHOTO"
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          <NoteForm
            travelId={travelId}
            userId={session.userId}
            type="DAY"
            dayDate={new Date().toISOString().slice(0, 10)}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          <NoteForm
            travelId={travelId}
            userId={session.userId}
            type="TRIP"
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        </div>

        {travel.notes.length > 0 && (
          <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
            {travel.notes.map((note) => (
              <li key={note.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-medium text-teal-700">{note.user.alias}</span>
                <span className="ml-2 text-xs uppercase text-slate-400">{note.type}</span>
                <p className="mt-1 text-slate-700">{note.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {travel.photos.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            Cronología ({travel.photos.length} fotos)
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {travel.photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
                <p className="truncate px-1 text-[10px] text-slate-500">
                  {photo.user.alias}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-indigo-900">Crónica del viaje</h2>
        <p className="mb-4 text-sm text-indigo-700/80">
          Genera un artículo narrativo en Markdown a partir de todas las fotos y notas del grupo.
        </p>
        {travel.journalMarkdown ? (
          <Link
            href={`/travel/${travelId}/journal`}
            className="mb-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            Ver crónica generada →
          </Link>
        ) : null}
        <GenerateJournalButton travelId={travelId} />
      </section>

      <section className="rounded-2xl border border-teal-100 bg-teal-50/40 p-6">
        <h2 className="mb-2 text-lg font-semibold text-teal-900">Exportar viaje</h2>
        <p className="mb-4 text-sm text-teal-800/80">
          Al finalizar el viaje, exporta un HTML estático con plantilla visual, crónica y mapa
          del recorrido.
        </p>
        <ExportHtmlPanel
          travelId={travelId}
          hasJournal={Boolean(travel.journalMarkdown)}
          hasGpsPhotos={travel.photos.some(
            (p) => p.latitude != null && p.longitude != null
          )}
        />
      </section>

      <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-6">
        <h2 className="mb-2 text-lg font-semibold text-violet-900">Álbum para imprenta</h2>
        <p className="mb-4 text-sm text-violet-800/80">
          PDF maquetado para imprenta profesional (A4 horizontal o cuadrado 21×21 cm).
        </p>
        <ExportPdfPanel
          travelId={travelId}
          hasJournal={Boolean(travel.journalMarkdown)}
          photoCount={travel.photos.filter((p) => p.selected).length}
        />
      </section>
    </main>
  );
}
