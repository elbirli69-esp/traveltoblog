"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractExifFromFile,
  formatExifDate,
  isImageFile,
  isPhotoInTravelRange,
} from "@/lib/exif";
import { createPhotoPreviewUrl } from "@/lib/photo-preview";
import { createLocalId } from "@/lib/utils";
import type { ParsedPhoto, TravelDateRange } from "@/types";

interface PhotoUploadGridProps {
  travelId: string;
  userId: string;
  userAlias: string;
  dateRange: TravelDateRange;
  incomingFiles?: File[];
  onIncomingFilesHandled?: () => void;
  onPhotosConfirmed: (photos: ParsedPhoto[]) => Promise<void>;
  onTransportPhotoMarked?: (
    photoId: string,
    type: "start" | "end",
    exifDate: Date | null
  ) => void;
  /** Increment to open the file picker (best-effort after tab switch). */
  openPickerSignal?: number;
  highlight?: boolean;
}

export default function PhotoUploadGrid({
  travelId,
  userId,
  userAlias,
  dateRange,
  incomingFiles,
  onIncomingFilesHandled,
  onPhotosConfirmed,
  onTransportPhotoMarked,
  openPickerSignal = 0,
  highlight = false,
}: PhotoUploadGridProps) {
  const [photos, setPhotos] = useState<ParsedPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openPickerSignal) return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = window.setTimeout(() => {
      inputRef.current?.click();
    }, 120);
    return () => window.clearTimeout(t);
  }, [openPickerSignal]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const outOfRangeCount = useMemo(
    () => photos.filter((p) => p.outOfRange).length,
    [photos]
  );

  const selectedCount = useMemo(
    () => photos.filter((p) => p.selected && !p.outOfRange).length,
    [photos]
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      setProcessing(true);
      setError(null);

      try {
        const newPhotos: ParsedPhoto[] = [];
        let skipped = 0;

        const imageFiles = files.filter((file) => isImageFile(file));
        skipped += files.length - imageFiles.length;

        const parsed = await Promise.all(
          imageFiles.map(async (file) => {
            const previewUrl = await createPhotoPreviewUrl(file);
            try {
              const exif = await extractExifFromFile(file);
              const outOfRange = !isPhotoInTravelRange(exif.dateTime, dateRange);
              return {
                id: createLocalId(),
                file,
                previewUrl,
                exif,
                selected: !outOfRange,
                outOfRange,
                isTransportStart: false,
                isTransportEnd: false,
              } satisfies ParsedPhoto;
            } catch {
              URL.revokeObjectURL(previewUrl);
              return null;
            }
          })
        );

        for (const photo of parsed) {
          if (photo) newPhotos.push(photo);
          else skipped += 1;
        }

        if (newPhotos.length === 0) {
          setError(
            skipped > 0
              ? "No se pudieron procesar las imágenes seleccionadas."
              : "No se encontraron imágenes válidas."
          );
        } else {
          setPhotos((prev) => [...prev, ...newPhotos]);
        }
      } catch {
        setError("Error al procesar las imágenes. Prueba de nuevo.");
      } finally {
        setProcessing(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [dateRange]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;
      await processFiles(Array.from(files));
    },
    [processFiles]
  );

  useEffect(() => {
    if (!incomingFiles?.length) return;
    void processFiles(incomingFiles).then(() => onIncomingFilesHandled?.());
    // Only re-run when a new batch arrives (by length + first file identity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingFiles?.length, incomingFiles?.[0]?.name, incomingFiles?.[0]?.size]);

  const toggleSelect = useCallback((id: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const markTransport = useCallback(
    (id: string, type: "start" | "end") => {
      setPhotos((prev) =>
        prev.map((p) => {
          if (type === "start") {
            return {
              ...p,
              isTransportStart: p.id === id,
              isTransportEnd: p.id === id ? false : p.isTransportEnd,
            };
          }
          return {
            ...p,
            isTransportEnd: p.id === id,
            isTransportStart: p.id === id ? false : p.isTransportStart,
          };
        })
      );

      const photo = photos.find((p) => p.id === id);
      if (photo && onTransportPhotoMarked) {
        onTransportPhotoMarked(id, type, photo.exif.dateTime);
      }
    },
    [photos, onTransportPhotoMarked]
  );

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const handleConfirm = async () => {
    const toUpload = photos.filter((p) => p.selected);
    if (!toUpload.length) {
      setError("Selecciona al menos una foto.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await onPhotosConfirmed(toUpload);
      toUpload.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos((prev) => prev.filter((p) => !p.selected));
    } catch {
      setError("Error al guardar las fotos. Se intentará sincronizar offline.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={sectionRef}
      id="photo-upload-section"
      className={`space-y-6 rounded-2xl transition ring-offset-2 ${
        highlight ? "ring-2 ring-teal-400 ring-offset-4" : ""
      }`}
    >
      {/* Header / status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Fotos del viaje</h2>
          <p className="text-sm text-slate-500">
            Subiendo como <span className="font-medium text-teal-700">{userAlias}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isOnline
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {isOnline ? "En línea" : "Sin conexión — modo offline"}
          </span>
        </div>
      </div>

      {/* File input */}
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/50 px-6 py-10 transition hover:border-teal-400 hover:bg-teal-50">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={processing}
        />
        <svg
          className="mb-3 h-10 w-10 text-teal-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm font-medium text-teal-800">
          {processing ? "Leyendo EXIF…" : "Seleccionar fotos de la galería"}
        </span>
        <span className="mt-1 text-xs text-teal-600">
          También puedes compartir desde la galería del móvil a TravelToBlog
        </span>
      </label>

      {/* Date range info */}
      {(dateRange.start || dateRange.end) && (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium">Rango del viaje: </span>
          {dateRange.start
            ? formatExifDate(dateRange.start)
            : "Inicio pendiente"}
          {" → "}
          {dateRange.end ? formatExifDate(dateRange.end) : "Fin pendiente"}
          {outOfRangeCount > 0 && (
            <span className="ml-2 text-amber-600">
              ({outOfRangeCount} fuera de rango)
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`group relative overflow-hidden rounded-xl border-2 transition ${
                  photo.outOfRange
                    ? "border-amber-300 opacity-60"
                    : photo.selected
                      ? "border-teal-500 shadow-md"
                      : "border-slate-200 opacity-50"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />

                {/* Selection overlay */}
                <button
                  type="button"
                  onClick={() => toggleSelect(photo.id)}
                  className="absolute inset-0 flex items-start justify-end p-2"
                  aria-label={photo.selected ? "Deseleccionar" : "Seleccionar"}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      photo.selected
                        ? "bg-teal-500 text-white"
                        : "bg-white/80 text-slate-400"
                    }`}
                  >
                    {photo.selected ? "✓" : ""}
                  </span>
                </button>

                {/* EXIF info */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="truncate text-[10px] text-white">
                    {formatExifDate(photo.exif.dateTime)}
                  </p>
                  {photo.exif.latitude != null && (
                    <p className="truncate text-[10px] text-white/70">
                      {photo.exif.latitude.toFixed(4)},{" "}
                      {photo.exif.longitude?.toFixed(4)}
                    </p>
                  )}
                  {photo.outOfRange && (
                    <p className="text-[10px] font-medium text-amber-300">
                      Fuera de rango
                    </p>
                  )}
                </div>

                {/* Transport markers */}
                <div className="absolute left-2 top-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => markTransport(photo.id, "start")}
                    title="Marcar como transporte de ida"
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      photo.isTransportStart
                        ? "bg-blue-500 text-white"
                        : "bg-white/80 text-slate-600 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    Ida
                  </button>
                  <button
                    type="button"
                    onClick={() => markTransport(photo.id, "end")}
                    title="Marcar como transporte de vuelta"
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      photo.isTransportEnd
                        ? "bg-purple-500 text-white"
                        : "bg-white/80 text-slate-600 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    Vuelta
                  </button>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white shadow-sm"
                  aria-label="Eliminar"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {selectedCount} de {photos.length} seleccionadas
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={uploading || selectedCount === 0}
              className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Guardando…" : isOnline ? "Confirmar fotos" : "Guardar offline"}
            </button>
          </div>
        </>
      )}

      {/* Hidden fields for context (used by sync layer) */}
      <input type="hidden" name="travelId" value={travelId} />
      <input type="hidden" name="userId" value={userId} />
    </div>
  );
}
