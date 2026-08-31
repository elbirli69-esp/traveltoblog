"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PhotoUploadSection from "@/components/PhotoUploadSection";
import PhotoGallery from "@/components/PhotoGallery";
import SharePanel from "@/components/SharePanel";
import EditableNote from "@/components/EditableNote";
import NoteForm from "@/components/NoteForm";
import OfflineSyncBanner from "@/components/OfflineSyncBanner";
import GenerateJournalButton from "@/components/GenerateJournalButton";
import ExportHtmlPanel from "@/components/ExportHtmlPanel";
import ExportPdfPanel from "@/components/ExportPdfPanel";
import TravelWorkspaceTabs, {
  type TravelTab,
} from "@/components/TravelWorkspaceTabs";
import TravelDayCalendar from "@/components/TravelDayCalendar";
import TravelPlacesPanel from "@/components/TravelPlacesPanel";
import TravelCollaborationBar from "@/components/TravelCollaborationBar";
import AddMemorySheet, {
  type AddMemoryKind,
} from "@/components/AddMemorySheet";
import type { PlaceType } from "@prisma/client";
import { getSessionFromStorage, rememberTravel, touchTravelHistory } from "@/lib/utils";
import {
  consumePendingShareId,
  discardSharedBundle,
  fetchSharedFiles,
} from "@/lib/share-client";
import { todayKey } from "@/lib/travel-dates";
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
    notes?: {
      id: string;
      text: string;
      user: { alias: string };
    }[];
  }[];
}

const ADD_KINDS = new Set<AddMemoryKind>(["photo", "place", "day", "trip"]);

function tabForKind(kind: AddMemoryKind): TravelTab {
  if (kind === "photo") return "photos";
  if (kind === "place") return "places";
  if (kind === "day") return "days";
  return "trip";
}

export default function TravelPage({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams();
  const [travelId, setTravelId] = useState<string | null>(null);
  const [travel, setTravel] = useState<TravelData | null>(null);
  const [session, setSession] = useState<ReturnType<typeof getSessionFromStorage>>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [incomingFiles, setIncomingFiles] = useState<File[] | undefined>(undefined);
  const [sharedNotice, setSharedNotice] = useState<string | null>(null);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TravelTab>("photos");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [placeAddSignal, setPlaceAddSignal] = useState(0);
  const [photoPickerSignal, setPhotoPickerSignal] = useState(0);
  const [highlightUpload, setHighlightUpload] = useState(false);
  const [focusDayDate, setFocusDayDate] = useState<string | null>(null);
  const [dayNoteSignal, setDayNoteSignal] = useState(0);
  const [tripNoteSignal, setTripNoteSignal] = useState(0);
  const deepLinkHandled = useRef<string | null>(null);
  const tripNoteRef = useRef<HTMLDivElement>(null);

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
      const currentSession = getSessionFromStorage();
      if (currentSession && currentSession.travelId === travelId) {
        rememberTravel({
          userId: currentSession.userId,
          alias: currentSession.alias,
          travelId,
          title: data.travel.title,
          shareCode: data.travel.shareCode,
        });
        touchTravelHistory(travelId);
      }
    }
  }, [travelId]);

  useEffect(() => {
    loadTravel();
  }, [loadTravel, refreshKey]);

  useEffect(() => {
    if (!travelId || !session || session.travelId !== travelId) return;

    const sharedFromUrl = searchParams.get("shared");
    const sharedFromSession = consumePendingShareId();
    const bundleId = sharedFromUrl ?? sharedFromSession;
    if (!bundleId) return;

    let cancelled = false;
    setSharedNotice("Importando fotos compartidas…");

    void fetchSharedFiles(bundleId)
      .then((files) => {
        if (cancelled) return;
        setIncomingFiles(files);
        setActiveShareId(bundleId);
        setSharedNotice(
          `${files.length} foto${files.length === 1 ? "" : "s"} compartida${files.length === 1 ? "" : "s"} lista${files.length === 1 ? "" : "s"} para revisar.`
        );
        window.history.replaceState({}, "", `/travel/${travelId}`);
      })
      .catch(() => {
        if (!cancelled) {
          setSharedNotice("No se pudieron cargar las fotos compartidas.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [travelId, session, searchParams]);

  const handleIncomingFilesHandled = useCallback(() => {
    setIncomingFiles(undefined);
    if (activeShareId) {
      void discardSharedBundle(activeShareId);
      setActiveShareId(null);
    }
  }, [activeShareId]);

  const applyAddMemory = useCallback((kind: AddMemoryKind, dateParam?: string | null) => {
    setActiveTab(tabForKind(kind));
    setHighlightUpload(false);

    if (kind === "photo") {
      setHighlightUpload(true);
      setPhotoPickerSignal((n) => n + 1);
      window.setTimeout(() => setHighlightUpload(false), 4000);
    } else if (kind === "place") {
      setPlaceAddSignal((n) => n + 1);
    } else if (kind === "day") {
      setFocusDayDate(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey());
      setDayNoteSignal((n) => n + 1);
    } else {
      setTripNoteSignal((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    if (!tripNoteSignal) return;
    const t = window.setTimeout(() => {
      tripNoteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      const textarea = tripNoteRef.current?.querySelector("textarea");
      textarea?.focus();
    }, 80);
    return () => window.clearTimeout(t);
  }, [tripNoteSignal]);

  useEffect(() => {
    if (!travelId || !session || session.travelId !== travelId) return;
    const add = searchParams.get("add");
    if (!add || !ADD_KINDS.has(add as AddMemoryKind)) return;

    const date = searchParams.get("date");
    const token = `${add}:${date ?? ""}`;
    if (deepLinkHandled.current === token) return;
    deepLinkHandled.current = token;

    applyAddMemory(add as AddMemoryKind, date);
    window.history.replaceState({}, "", `/travel/${travelId}`);
  }, [travelId, session, searchParams, applyAddMemory]);

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
    <main className="relative mx-auto max-w-3xl space-y-8 px-4 py-8 pb-28">
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

      {sharedNotice && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {sharedNotice}
        </div>
      )}

      <TravelCollaborationBar
        travelId={travelId}
        participantCount={travel.users.length}
        lastUpdated={travel.updatedAt}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />

      <SharePanel shareCode={travel.shareCode} title={travel.title} />

      <TravelWorkspaceTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        photosContent={
          <div className="space-y-8">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <PhotoUploadSection
                travelId={travelId}
                userId={session.userId}
                userAlias={session.alias}
                dateRange={dateRange}
                incomingFiles={incomingFiles}
                onIncomingFilesHandled={handleIncomingFilesHandled}
                onSyncComplete={() => setRefreshKey((k) => k + 1)}
                openPickerSignal={photoPickerSignal}
                highlight={highlightUpload}
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
              focusDate={focusDayDate}
              focusNoteSignal={dayNoteSignal}
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
              startAddSignal={placeAddSignal}
            />
          </section>
        }
        tripContent={
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              {tripNotes.length > 0 ? "Notas del viaje" : "Nota del viaje"}
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Anécdotas y comentarios sobre el viaje completo — no ligados a un día o una foto.
              La crónica las usa sobre todo en la introducción y la conclusión.
            </p>
            {tripNotes.length > 0 && (
              <ul className="mb-4 space-y-3">
                {tripNotes.map((note) => (
                  <EditableNote
                    key={note.id}
                    note={note}
                    onChanged={() => setRefreshKey((k) => k + 1)}
                  />
                ))}
              </ul>
            )}
            <div
              ref={tripNoteRef}
              id="trip-note-form"
              className={tripNotes.length > 0 ? "border-t border-slate-100 pt-4" : undefined}
            >
              <NoteForm
                travelId={travelId}
                userId={session.userId}
                type="TRIP"
                onCreated={() => setRefreshKey((k) => k + 1)}
              />
            </div>
          </section>
        }
      />

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
            Ver y editar crónica →
          </Link>
        ) : null}
        <GenerateJournalButton
          travelId={travelId}
          hasExistingJournal={Boolean(travel.journalMarkdown)}
        />
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

      <button
        type="button"
        onClick={() => setAddSheetOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/30 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 sm:bottom-8 sm:right-8"
      >
        <span className="text-lg leading-none" aria-hidden>
          +
        </span>
        Añadir recuerdo
      </button>

      <AddMemorySheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onSelect={(kind) => {
          setAddSheetOpen(false);
          applyAddMemory(kind);
        }}
      />
    </main>
  );
}
