"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EditableNote from "@/components/EditableNote";
import EmptyMemoryState from "@/components/EmptyMemoryState";
import NoteForm from "@/components/NoteForm";
import PhotoImage from "@/components/PhotoImage";
import {
  addDaysToKey,
  clampDateKey,
  formatDateKey,
  isoToDateKey,
  resolveTravelDayRange,
  todayKey,
} from "@/lib/travel-dates";

interface DayNote {
  id: string;
  text: string;
  dayDate: string | null;
  user: { alias: string };
}

interface DayPhoto {
  id: string;
  url: string;
  exifDateTime: string | null;
  user: { alias: string };
  notes?: {
    id: string;
    text: string;
    type: string;
    user: { alias: string };
  }[];
}

interface TravelDayCalendarProps {
  travelId: string;
  userId: string;
  startDate: string | null;
  endDate: string | null;
  photos: DayPhoto[];
  dayNotes: DayNote[];
  onNoteCreated?: () => void;
  /** YYYY-MM-DD from Añadir recuerdo / ?add=day&date= */
  focusDate?: string | null;
  /** Increment to scroll/focus the day note form */
  focusNoteSignal?: number;
  onAddDayNote?: (dateKey: string) => void;
}

export default function TravelDayCalendar({
  travelId,
  userId,
  startDate,
  endDate,
  photos,
  dayNotes,
  onNoteCreated,
  focusDate = null,
  focusNoteSignal = 0,
  onAddDayNote,
}: TravelDayCalendarProps) {
  const range = useMemo(
    () =>
      resolveTravelDayRange({
        startDate,
        endDate,
        photoExifDates: photos.map((p) => p.exifDateTime),
      }),
    [startDate, endDate, photos]
  );

  const initialDate = clampDateKey(todayKey(), range.startKey, range.endKey);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [photoNoteId, setPhotoNoteId] = useState<string | null>(null);
  const noteFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusDate) return;
    setSelectedDate(clampDateKey(focusDate, range.startKey, range.endKey));
  }, [focusDate, range.startKey, range.endKey]);

  useEffect(() => {
    if (!focusNoteSignal) return;
    noteFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const textarea = noteFormRef.current?.querySelector("textarea");
    textarea?.focus();
  }, [focusNoteSignal]);

  const activeDate = clampDateKey(selectedDate, range.startKey, range.endKey);

  const notesForDay = useMemo(
    () =>
      dayNotes.filter(
        (n) => n.dayDate != null && isoToDateKey(n.dayDate) === activeDate
      ),
    [dayNotes, activeDate]
  );

  const photosForDay = useMemo(
    () =>
      photos.filter(
        (p) => p.exifDateTime != null && isoToDateKey(p.exifDateTime) === activeDate
      ),
    [photos, activeDate]
  );

  const daysWithContent = useMemo(() => {
    const set = new Set<string>();
    for (const n of dayNotes) {
      if (n.dayDate) set.add(isoToDateKey(n.dayDate));
    }
    for (const p of photos) {
      if (p.exifDateTime) set.add(isoToDateKey(p.exifDateTime));
    }
    return set;
  }, [dayNotes, photos]);

  const changeDate = (delta: number) => {
    setSelectedDate((prev) =>
      clampDateKey(addDaysToKey(prev, delta), range.startKey, range.endKey)
    );
  };

  const atStart = activeDate <= range.startKey;
  const atEnd = activeDate >= range.endKey;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Calendario del viaje</h2>
          <p className="text-sm text-slate-500">
            {range.dayKeys.length} día{range.dayKeys.length !== 1 ? "s" : ""} ·{" "}
            {formatDateKey(range.startKey, "short")} — {formatDateKey(range.endKey, "short")}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => changeDate(-1)}
            disabled={atStart}
            aria-label="Día anterior"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            ◀
          </button>
          <div className="min-w-[11rem] rounded-xl bg-teal-50 px-4 py-2 text-center">
            <span className="mr-1.5" aria-hidden>
              📅
            </span>
            <span className="text-sm font-semibold text-teal-900">
              {formatDateKey(activeDate, "short")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => changeDate(1)}
            disabled={atEnd}
            aria-label="Día siguiente"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            ▶
          </button>
        </div>
      </div>

      {range.dayKeys.length <= 21 && (
        <div className="flex flex-wrap gap-1.5">
          {range.dayKeys.map((key) => {
            const isActive = key === activeDate;
            const hasContent = daysWithContent.has(key);
            const dayNum = parseDateKeyLocal(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={`relative flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-teal-600 text-white"
                    : hasContent
                      ? "bg-teal-50 text-teal-800 hover:bg-teal-100"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title={formatDateKey(key, "long")}
              >
                {dayNum}
                {hasContent && !isActive && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-teal-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-base font-semibold text-slate-800">
          Resumen del día
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          {photosForDay.length} foto{photosForDay.length !== 1 ? "s" : ""} ·{" "}
          {notesForDay.length} nota{notesForDay.length !== 1 ? "s" : ""}
        </p>

        {photosForDay.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Fotos del día
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photosForDay.map((photo) => {
                const isOpen = photoNoteId === photo.id;
                const photoNotes =
                  photo.notes?.filter((n) => n.type === "PHOTO") ?? [];
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() =>
                      setPhotoNoteId(isOpen ? null : photo.id)
                    }
                    className={`overflow-hidden rounded-xl border bg-white text-left transition ${
                      isOpen
                        ? "border-teal-400 ring-2 ring-teal-500/30"
                        : "border-slate-200 hover:border-teal-300"
                    }`}
                  >
                    <PhotoImage
                      photoId={photo.id}
                      url={photo.url}
                      className="aspect-square w-full bg-slate-100 object-cover"
                    />
                    <div className="space-y-0.5 px-1.5 py-1.5">
                      <p className="truncate text-[10px] font-medium text-slate-600">
                        {photo.user.alias}
                        {photoNotes.length > 0
                          ? ` · ${photoNotes.length} nota${photoNotes.length !== 1 ? "s" : ""}`
                          : ""}
                      </p>
                      <p className="text-[10px] font-semibold text-teal-700">
                        {isOpen ? "Cerrar nota" : "Añadir nota"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {photoNoteId &&
              (() => {
                const photo = photosForDay.find((p) => p.id === photoNoteId);
                if (!photo) return null;
                const photoNotes =
                  photo.notes?.filter((n) => n.type === "PHOTO") ?? [];
                return (
                  <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-teal-900">
                        Nota para esta foto
                      </p>
                      <button
                        type="button"
                        onClick={() => setPhotoNoteId(null)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800"
                      >
                        Cerrar
                      </button>
                    </div>
                    {photoNotes.length > 0 && (
                      <ul className="space-y-2">
                        {photoNotes.map((note) => (
                          <EditableNote
                            key={note.id}
                            note={note}
                            onChanged={onNoteCreated}
                          />
                        ))}
                      </ul>
                    )}
                    <NoteForm
                      travelId={travelId}
                      userId={userId}
                      photoId={photo.id}
                      type="PHOTO"
                      onCreated={() => onNoteCreated?.()}
                    />
                  </div>
                );
              })()}
          </div>
        )}

        {notesForDay.length > 0 ? (
          <ul className="mb-5 space-y-2">
            {notesForDay.map((note) => (
              <EditableNote
                key={note.id}
                note={note}
                onChanged={onNoteCreated}
              />
            ))}
          </ul>
        ) : (
          <div className="mb-5">
            <EmptyMemoryState
              title="Sin nota para este día"
              description="Resume cómo fue el día; la crónica lo usará en el capítulo correspondiente."
              actionLabel="Escribir nota del día"
              onAction={
                onAddDayNote ? () => onAddDayNote(activeDate) : undefined
              }
            />
          </div>
        )}

        <div
          ref={noteFormRef}
          id="day-note-form"
          className="border-t border-slate-100 pt-4"
        >
          <NoteForm
            travelId={travelId}
            userId={userId}
            type="DAY"
            dayDate={activeDate}
            onCreated={() => onNoteCreated?.()}
          />
        </div>
      </section>
    </div>
  );
}

function parseDateKeyLocal(key: string): number {
  return Number(key.split("-")[2]);
}
