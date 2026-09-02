import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const base =
    process.env.NEXT_PUBLIC_HTTPS_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  return {
    name: "TravelToBlog",
    short_name: "TravelToBlog",
    description: "Diario colaborativo de viajes con fotos, notas e IA",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#05080c",
    theme_color: "#3dffb8",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    share_target: {
      action: `${base}/api/share-target`,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "photos",
            accept: [
              "image/*",
              "video/*",
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/heic",
              "image/heif",
              "video/mp4",
              "video/webm",
              "video/quicktime",
            ],
          },
        ],
      },
    },
    launch_handler: {
      client_mode: "navigate-existing",
    },
  };
}
