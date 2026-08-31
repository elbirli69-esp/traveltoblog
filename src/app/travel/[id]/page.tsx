"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PhotoUploadSection from "@/components/PhotoUploadSection";
import PhotoGallery from "@/components/PhotoGallery";
import SharePanel from "@/components/SharePanel";
import NoteForm from "@/components/NoteForm";
import OfflineSyncBanner from "@/components/OfflineSyncBanner";
import GenerateJournalButton from "@/components/GenerateJournalButton";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import TravelWorkspaceTabs from "@/components/TravelWorkspaceTabs";
import TravelDayCalendar from "@/components/TravelDayCalendar";
import TravelPlacesPanel from "@/components/TravelPlacesPanel";
import TravelCollaborationBar from "@/components/TravelCollaborationBar";
import type { PlaceType } from "@prisma/client";
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
    isTransportStart: boolean;
    isTransportEnd: boolean;
    user: { alias: string };
    notes: {
      id: string;
      text: string;
      type: string;
      user: { alias: string };
    }[];
  }[];
  notes: {
    id: string;
    text: string;
    type: string;
    photoId: string | null;
    dayDate: string | null;
    user: { alias: string };
  }[];
  journalMarkdown: string | null;
  updatedAt: string;
  places: {
    id: string;
    name: string;
    type: PlaceType;
    latitude: number;
    longitude: number;
    comment: string | null;
    user: { alias: string };
  }[];
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

  const tripNotes = travel.notes.filter((n) => n.type === "TRIP");
  const dayNotes = travel.notes.filter((n) => n.type === "DAY");

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

      <TravelCollaborationBar
        travelId={travelId}
        participantCount={travel.users.length}
        lastUpdated={travel.updatedAt}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />

      <SharePanel shareCode={travel.shareCode} title={travel.title} />

      <TravelWorkspaceTabs
        photosContent={
          <div className="space-y-8">
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
              <PhotoGallery
                photos={travel.photos}
                travelId={travelId}
                userId={session.userId}
                onNoteCreated={() => setRefreshKey((k) => k + 1)}
              />
            </section>
          </div>
        }
        daysContent={
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <TravelDayCalendar
              travelId={travelId}
              userId={session.userId}
              startDate={travel.startDate}
              endDate={travel.endDate}
              photos={travel.photos}
              dayNotes={dayNotes}
              onNoteCreated={() => setRefreshKey((k) => k + 1)}
            />
          </section>
        }
        placesContent={
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <TravelPlacesPanel
              travelId={travelId}
              userId={session.userId}
              places={travel.places}
              photos={travel.photos}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          </section>
        }
      />

      {tripNotes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Notas del trayecto</h2>
          <ul className="space-y-3">
            {tripNotes.map((note) => (
              <li key={note.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-medium text-teal-700">{note.user.alias}</span>
                <p className="mt-1 text-slate-700">{note.text}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <NoteForm
              travelId={travelId}
              userId={session.userId}
              type="TRIP"
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </section>
      )}

      {tripNotes.length === 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Nota del trayecto</h2>
          <NoteForm
            travelId={travelId}
            userId={session.userId}
            type="TRIP"
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        </section>
      )}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-indigo-900">Crónica del viaje</h2>
        <p className="mb-4 text-sm text-indigo-700/80">
          Elige el estilo y genera un artículo en varios pasos: introducción, resumen por día,
          leyendas de fotos y conclusión.
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
