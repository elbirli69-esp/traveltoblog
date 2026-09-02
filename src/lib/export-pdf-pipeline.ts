export type PdfPipelineStep = "load" | "photos" | "html" | "render" | "complete";

export interface PdfPipelineEvent {
  step: PdfPipelineStep | "error";
  status: "running" | "done" | "error";
  message?: string;
  current?: number;
  total?: number;
  filename?: string;
  contentType?: string;
  blobBase64?: string;
}

export type PdfProgressCallback = (event: PdfPipelineEvent) => void;

export const PDF_STEP_LABELS: Record<PdfPipelineStep, string> = {
  load: "Cargando viaje",
  photos: "Optimizando fotos para imprenta",
  html: "Maquetando álbum",
  render: "Generando PDF (WeasyPrint)",
  complete: "Listo",
};

export const PDF_PROGRESS_STEPS: PdfPipelineStep[] = [
  "load",
  "photos",
  "html",
  "render",
];
