"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractExifFromFile,
  formatExifDate,
  formatGpsCoordinates,
  isImageFile,
  isPhotoInTravelRange,
  isValidGps,
  mergeExifMetadata,
  wasAndroidGpsStripped,
} from "@/lib/exif";
import { applyCurrentLocationToPhotos, applyPlaceToPhoto, isAndroidDevice } from "@/lib/geolocation-photo";
import {
  formatCapacitorError,
  isCapacitorAndroid,
  isPhotoExifPluginAvailable,
  nativePhotoToFile,
  PhotoExif,
  type NativePickedPhoto,
} from "@/lib/capacitor-native";
import { pickImagesFromFileExplorer } from "@/lib/photo-picker";
import { createPhotoPreviewUrl } from "@/lib/photo-preview";
import { createLocalId } from "@/lib/utils";
import type { ParsedPhoto, TravelDateRange } from "@/types";

/** Android photo picker strips GPS when accept="image/*". text/plain opens file explorer. */
const PHOTO_INPUT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif,text/plain,application/octet-stream";

function normalizeNativePickedPhotos(
  photos: NativePickedPhoto[] | Record<string, NativePickedPhoto> | undefined
): NativePickedPhoto[] {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos;
  return Object.values(photos);
}

export interface UploadPlaceOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface PhotoUploadGridProps {
  travelId: string;
  userId: string;
  userAlias: string;
  dateRange: TravelDateRange;
  places?: UploadPlaceOption[];
  incomingFiles?: File[];
  incomingExifByName?: Record<string, import("@/types").ExifMetadata>;
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
  /** Hide pickers; show review UI only after selecting photos (via Añadir recuerdo). */
  addOnly?: boolean;
}

export default function PhotoUploadGrid({
  travelId,
  userId,
  userAlias,
  dateRange,
  places = [],
  incomingFiles,
  incomingExifByName,
  onIncomingFilesHandled,
  onPhotosConfirmed,
  onTransportPhotoMarked,
  openPickerSignal = 0,
  highlight = false,
  addOnly = false,
}: PhotoUploadGridProps) {
  const [photos, setPhotos] = useState<ParsedPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const explorerInputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

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

  const missingGpsCount = useMemo(
    () =>
      photos.filter(
        (p) => p.selected && !p.outOfRange && !isValidGps(p.exif.latitude, p.exif.longitude)
      ).length,
    [photos]
  );

  const strippedGpsCount = useMemo(
    () => photos.filter((p) => p.gpsStripped).length,
    [photos]
  );

  const processFiles = useCallback(
    async (files: File[], serverExif: Record<string, import("@/types").ExifMetadata> = {}) => {
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
              const clientExif = await extractExifFromFile(file);
              const gpsStripped = await wasAndroidGpsStripped(file);
              const hint = serverExif[file.name];
              const exif = hint ? mergeExifMetadata(clientExif, hint) : clientExif;
              const outOfRange = !isPhotoInTravelRange(exif.dateTime, dateRange);
              return {
                id: createLocalId(),
                file,
                previewUrl,
                exif,
                gpsStripped,
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

  const handleExplorerSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;
      await processFiles(Array.from(files));
      if (explorerInputRef.current) explorerInputRef.current.value = "";
    },
    [processFiles]
  );

  const openExplorerPicker = useCallback(async () => {
    setError(null);
    try {
      const files = await pickImagesFromFileExplorer();
      if (files.length) await processFiles(files);
    } catch {
      explorerInputRef.current?.click();
    }
  }, [processFiles]);

  const buildPhotoFromNativePick = useCallback(
    async (item: NativePickedPhoto): Promise<ParsedPhoto | null> => {
      try {
        const file = await nativePhotoToFile(item);
        let previewUrl: string;
        try {
          previewUrl = await createPhotoPreviewUrl(file);
        } catch {
          previewUrl = URL.createObjectURL(file);
        }
        let clientExif;
        try {
          clientExif = await extractExifFromFile(file);
        } catch {
          clientExif = {
            dateTime: item.dateTime ? new Date(item.dateTime) : null,
            latitude: item.latitude,
            longitude: item.longitude,
          };
        }
        const hint = {
          latitude: item.latitude,
          longitude: item.longitude,
          dateTime: item.dateTime ? new Date(item.dateTime) : clientExif.dateTime,
        };
        const exif = mergeExifMetadata(clientExif, hint);
        const outOfRange = !isPhotoInTravelRange(exif.dateTime, dateRange);
        return {
          id: createLocalId(),
          file,
          previewUrl,
          exif,
          gpsStripped: item.gpsStripped,
          selected: !outOfRange,
          outOfRange,
          isTransportStart: false,
          isTransportEnd: false,
        };
      } catch {
        return null;
      }
    },
    [dateRange]
  );

  const openNativeGalleryPicker = useCallback(async () => {
    if (!isCapacitorAndroid()) return;
    if (!isPhotoExifPluginAvailable()) {
      setError(
        "Galería nativa no disponible. Reinstala el APK desde /download/android (v1.0.4+)."
      );
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const result = await PhotoExif.pickImages({ limit: 20 });
      const picked = normalizeNativePickedPhotos(result.photos);
      if (!picked.length) {
        setError("No se seleccionaron imágenes o el sistema no permitió leerlas.");
        return;
      }

      const newPhotos: ParsedPhoto[] = [];
      for (const item of picked) {
        const built = await buildPhotoFromNativePick(item);
        if (built) newPhotos.push(built);
      }

      if (newPhotos.length === 0) {
        setError(
          "No se pudieron procesar las imágenes. Actualiza la app en /download/android (v1.0.4+)."
        );
      } else {
        setPhotos((prev) => [...prev, ...newPhotos]);
      }
    } catch (error) {
      const msg = formatCapacitorError(error);
      if (/denegad/i.test(msg) || /permission/i.test(msg)) {
        setError(
          "Permiso de fotos denegado. Ve a Ajustes → Apps → TravelToBlog → Permisos y activa Fotos y Ubicación en medios."
        );
      } else {
        setError(`No se pudo abrir la galería nativa: ${msg}`);
      }
    } finally {
      setProcessing(false);
    }
  }, [buildPhotoFromNativePick]);

  useEffect(() => {
    if (!openPickerSignal) return;
    if (!addOnly) {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const t = window.setTimeout(() => {
      if (isCapacitorAndroid()) {
        void openNativeGalleryPicker();
      } else {
        inputRef.current?.click();
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [openPickerSignal, addOnly, openNativeGalleryPicker]);

  const applyLocationToPhoto = useCallback(async (photoId: string) => {
    setLocationBusy(true);
    setError(null);
    try {
      const updated = await applyCurrentLocationToPhotos(
        photos.filter((p) => p.id === photoId)
      );
      const next = updated[0];
      if (!next) return;
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...next, gpsStripped: false } : p
        )
      );
    } catch {
      setError("No se pudo obtener tu ubicación.");
    } finally {
      setLocationBusy(false);
    }
  }, [photos]);

  const assignPlaceToPhoto = useCallback(
    (photoId: string, placeId: string) => {
      const place = places.find((p) => p.id === placeId);
      if (!place) return;
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...applyPlaceToPhoto(p, place), gpsStripped: false }
            : p
        )
      );
    },
    [places]
  );

  const applyLocationToSelected = useCallback(async () => {
    const targets = photos.filter(
      (p) => p.selected && !isValidGps(p.exif.latitude, p.exif.longitude)
    );
    if (!targets.length) return;

    setLocationBusy(true);
    setError(null);
    try {
      const updated = await applyCurrentLocationToPhotos(targets);
      const byId = new Map(updated.map((p) => [p.id, p]));
      setPhotos((prev) =>
        prev.map((p) => {
          const next = byId.get(p.id);
          if (!next) return p;
          return { ...next, gpsStripped: false };
        })
      );
    } catch {
      setError("No se pudo obtener tu ubicación. Revisa el permiso de GPS del navegador.");
    } finally {
      setLocationBusy(false);
    }
  }, [photos]);

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
    void processFiles(incomingFiles, incomingExifByName ?? {})
      .then(() => onIncomingFilesHandled?.());
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
    let toUpload = photos.filter((p) => p.selected);
    if (!toUpload.length) {
      setError("Selecciona al menos una foto.");
      return;
    }

    const missingGps = toUpload.some(
      (p) => !isValidGps(p.exif.latitude, p.exif.longitude)
    );

    if (missingGps && navigator.geolocation && isAndroidDevice()) {
      try {
        toUpload = await applyCurrentLocationToPhotos(toUpload);
        setPhotos((prev) =>
          prev.map((p) => {
            const updated = toUpload.find((u) => u.id === p.id);
            return updated ? { ...updated, gpsStripped: false } : p;
          })
        );
      } catch {
        const proceed = window.confirm(
          "No se pudo obtener tu ubicación. ¿Guardar las fotos sin coordenadas GPS?"
        );
        if (!proceed) {
          setError("Activa el permiso de ubicación del navegador o asigna un lugar a cada foto.");
          return;
        }
      }
    } else if (missingGps && navigator.geolocation) {
      const prompt =
        "Algunas fotos no tienen GPS en el archivo. ¿Usar tu ubicación actual para esas fotos?";
      if (window.confirm(prompt)) {
        try {
          toUpload = await applyCurrentLocationToPhotos(toUpload);
        } catch {
          setError("No se pudo obtener tu ubicación.");
          return;
        }
      }
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

  const showReview = photos.length > 0 || processing || uploading;
  const showPickers = !addOnly;
  const showPanel = showReview || (addOnly && Boolean(error));

  const panelClass = addOnly
    ? showPanel
      ? "sheet-bottom space-y-6"
      : "sr-only"
    : `space-y-6 rounded-2xl transition ring-offset-2 ${
        highlight ? "ring-2 ring-[var(--accent-cyan)] ring-offset-4 highlight-ring" : ""
      }`;

  return (
    <>
      {addOnly && showPanel && (
        <div className="fixed inset-0 z-40 bg-black/40" aria-hidden />
      )}
      <div ref={sectionRef} id="photo-upload-section" className={panelClass}>
      {addOnly && showReview && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">
            Revisar fotos
          </h2>
          {processing && (
            <span className="text-sm text-fg-secondary">Leyendo EXIF…</span>
          )}
        </div>
      )}

      {addOnly && !showPickers && (
        <div className="hidden" aria-hidden>
          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_INPUT_ACCEPT}
            multiple
            onChange={handleFileSelect}
            disabled={processing}
          />
          <input
            ref={explorerInputRef}
            type="file"
            accept="*/*"
            multiple
            onChange={handleExplorerSelect}
            disabled={processing}
          />
        </div>
      )}

      {showPickers && (
        <>
      {/* Header / status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">Fotos del viaje</h2>
          <p className="text-sm text-fg-secondary">
            Subiendo como <span className="font-medium text-accent-mint">{userAlias}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={isOnline ? "badge-online" : "badge-offline"}>
            <span className={isOnline ? "badge-dot-online" : "badge-dot-offline"} />
            {isOnline ? "En línea" : "Sin conexión — modo offline"}
          </span>
        </div>
      </div>

      {/* Pickers */}
      <div className={`grid gap-3 ${isCapacitorAndroid() ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
        {isCapacitorAndroid() ? (
          <button
            type="button"
            onClick={() => void openNativeGalleryPicker()}
            disabled={processing}
            className="picker-zone picker-zone-mint disabled:opacity-50"
          >
            <span className="text-sm font-medium text-accent-mint">
              {processing ? "Leyendo EXIF…" : "Galería nativa (GPS)"}
            </span>
            <span className="mt-1 text-[11px] text-fg-secondary">
              Lee ubicación embebida con permisos de la app Android (v1.0.4+)
            </span>
          </button>
        ) : (
          <>
        <label className="picker-zone picker-zone-mint cursor-pointer">
          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_INPUT_ACCEPT}
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={processing}
          />
          <span className="text-sm font-medium text-accent-mint">
            {processing ? "Leyendo EXIF…" : "Galería / selector rápido"}
          </span>
          <span className="mt-1 text-center text-[11px] text-fg-secondary">
            En Android puede quitar el GPS. Si aparece el toggle «Incluir ubicación», actívalo.
          </span>
        </label>

        <button
          type="button"
          onClick={() => void openExplorerPicker()}
          disabled={processing}
          className="picker-zone picker-zone-cyan disabled:opacity-50"
        >
          <input
            ref={explorerInputRef}
            type="file"
            accept="*/*"
            multiple
            className="hidden"
            onChange={handleExplorerSelect}
            disabled={processing}
          />
          <span className="text-sm font-medium text-accent-cyan">Explorador de archivos</span>
          <span className="mt-1 text-[11px] text-fg-secondary">
            Alternativa al selector; en muchos Android el GPS sigue sin llegar
          </span>
        </button>
          </>
        )}
      </div>

      {isAndroidDevice() && !isCapacitorAndroid() && (
        <div className="callout callout-warning text-sm">
          <p className="font-medium">En Android la web no puede leer el GPS de las fotos</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            El sistema envía una copia sin coordenadas (aunque la galería sí las muestre). No es
            un fallo de esta app: las webs no tienen permiso para leer la ubicación embebida. Usa
            <strong> «Usar mi ubicación»</strong> si estás en el sitio de la foto, o asigna un
            <strong> lugar del viaje</strong> debajo de cada imagen.
          </p>
        </div>
      )}
        </>
      )}

      {/* Date range info */}
      {(dateRange.start || dateRange.end) && (
        <div className="surface-inset px-4 py-3 text-sm text-fg-secondary">
          <span className="font-medium">Rango del viaje: </span>
          {dateRange.start
            ? formatExifDate(dateRange.start)
            : "Inicio pendiente"}
          {" → "}
          {dateRange.end ? formatExifDate(dateRange.end) : "Fin pendiente"}
          {outOfRangeCount > 0 && (
            <span className="ml-2 text-warning-inline">
              ({outOfRangeCount} fuera de rango)
            </span>
          )}
        </div>
      )}

      {strippedGpsCount > 0 && (
        <div className="callout callout-warning text-sm">
          <p className="font-medium">
            {strippedGpsCount} foto{strippedGpsCount === 1 ? "" : "s"} sin GPS en el archivo recibido
          </p>
          <p className="mt-1 text-xs">
            Pulsa <strong>Usar mi ubicación</strong> (arriba) o elige un lugar en cada foto antes
            de confirmar.
          </p>
        </div>
      )}

      {error && (
        <div className="callout callout-error text-sm">
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
                className={`group flex flex-col overflow-hidden rounded-xl border-2 transition ${
                  photo.outOfRange
                    ? "photo-tile-warn"
                    : photo.selected
                      ? "photo-tile-selected"
                      : "photo-tile-idle"
                }`}
              >
                <div className="relative">
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
                    className={
                      photo.selected ? "select-check-active" : "select-check-idle"
                    }
                  >
                    {photo.selected ? "✓" : ""}
                  </span>
                </button>

                {/* EXIF info */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="truncate text-[10px] text-white">
                    {formatExifDate(photo.exif.dateTime)}
                  </p>
                  {formatGpsCoordinates(photo.exif.latitude, photo.exif.longitude) && (
                    <p className="truncate text-[10px] text-white/70">
                      {formatGpsCoordinates(photo.exif.latitude, photo.exif.longitude)}
                    </p>
                  )}
                  {!isValidGps(photo.exif.latitude, photo.exif.longitude) && (
                    <p className="text-overlay-warn">
                      {photo.gpsStripped ? "GPS quitado por Android" : "Sin GPS en archivo"}
                    </p>
                  )}
                  {photo.outOfRange && (
                    <p className="text-overlay-warn">
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
                    className={`transport-mark ${
                      photo.isTransportStart
                        ? "transport-mark-blue"
                        : "transport-mark transport-mark-idle"
                    }`}
                  >
                    Ida
                  </button>
                  <button
                    type="button"
                    onClick={() => markTransport(photo.id, "end")}
                    title="Marcar como transporte de vuelta"
                    className={`transport-mark ${
                      photo.isTransportEnd
                        ? "transport-mark-purple"
                        : "transport-mark transport-mark-idle"
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

                {!isValidGps(photo.exif.latitude, photo.exif.longitude) && (
                  <div className="space-y-1.5 border-t border-[var(--border)] bg-[var(--card-grouped)] p-2">
                    {photo.gpsStripped && (
                      <p className="text-[10px] leading-tight opacity-90">
                        GPS quitado por Android
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => void applyLocationToPhoto(photo.id)}
                        disabled={locationBusy}
                        className="chip-btn disabled:opacity-50"
                      >
                        {locationBusy ? "…" : "📍 Aquí"}
                      </button>
                      {places.length > 0 && (
                        <select
                          className="form-input form-input-sm min-w-0 flex-1"
                          defaultValue=""
                          onChange={(e) => {
                            const placeId = e.target.value;
                            if (placeId) assignPlaceToPhoto(photo.id, placeId);
                          }}
                        >
                          <option value="" disabled>
                            Lugar…
                          </option>
                          {places.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-secondary">
              {selectedCount} de {photos.length} seleccionadas
              {missingGpsCount > 0 && ` · ${missingGpsCount} sin GPS`}
            </p>
            <div className="flex flex-wrap gap-2">
              {missingGpsCount > 0 && navigator.geolocation && (
                <button
                  type="button"
                  onClick={() => void applyLocationToSelected()}
                  disabled={locationBusy || uploading}
                  className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  {locationBusy ? "Obteniendo GPS…" : "Usar mi ubicación"}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={uploading || selectedCount === 0 || locationBusy}
                className="btn-primary px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Guardando…" : isOnline ? "Confirmar fotos" : "Guardar offline"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Hidden fields for context (used by sync layer) */}
      <input type="hidden" name="travelId" value={travelId} />
      <input type="hidden" name="userId" value={userId} />
    </div>
    </>
  );
}
