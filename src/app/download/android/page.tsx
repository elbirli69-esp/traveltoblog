import Link from "next/link";

export const metadata = {
  title: "App Android — TravelToBlog",
  description: "Descarga la app Android con GPS en fotos para TravelToBlog",
};

const APK_PATH = "/releases/traveltoblog-latest.apk";

export default function AndroidDownloadPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <header className="mb-8 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 text-3xl text-white shadow-lg">
          📱
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">App Android</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Lee el GPS de las fotos que la PWA en Android no puede recuperar.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-black/20">
        <a
          href={APK_PATH}
          download="traveltoblog-latest.apk"
          className="flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-teal-700"
        >
          Descargar APK
        </a>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 break-all">{APK_PATH}</p>

        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>Pulsa «Descargar APK» y espera a que termine.</li>
          <li>Abre el archivo descargado (notificación o carpeta Descargas).</li>
          <li>
            Si Android lo pide, activa «Instalar apps desconocidas» para Chrome o
            «Archivos».
          </li>
          <li>Confirma la instalación y abre TravelToBlog desde el icono.</li>
          <li>
            Al subir fotos, usa <strong>Galería nativa (GPS)</strong> dentro de la app.
          </li>
          <li>
            También puedes <strong>compartir fotos desde la galería</strong> y elegir{" "}
            <strong>TravelToBlog · App</strong> (v1.0.5+).
          </li>
        </ol>

        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">iPhone</p>
          <p className="mt-1 text-xs">
            En iPhone sigue siendo mejor la PWA (Añadir a pantalla de inicio). Esta APK
            es solo para Android.
          </p>
        </div>
      </section>

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
        <Link href="/" className="font-medium text-teal-600 hover:underline">
          ← Volver al inicio
        </Link>
      </p>
    </main>
  );
}
