export type PdfPageFormat = "a4-landscape" | "square";

export interface PdfPhotoAsset {
  id: string;
  url: string;
  filename: string;
  imagePath: string;
  latitude: number | null;
  longitude: number | null;
  exifDateTime: Date | null;
  alias: string;
  placeName?: string | null;
  highlightScore?: number;
  notes: string[];
}

export interface PdfExportContext {
  travel: {
    id: string;
    title: string;
    startDate: Date | null;
    endDate: Date | null;
    journalMarkdown: string | null;
  };
  users: { alias: string }[];
  photos: PdfPhotoAsset[];
  notes: {
    type: string;
    text: string;
    user: { alias: string };
  }[];
  format: PdfPageFormat;
}
