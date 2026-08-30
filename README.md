# TravelToBlog — PWA colaborativa de diarios de viaje

Progressive Web App open-source para registrar viajes con fotos y notas, generar crónicas con IA y publicarlas en un blog. Diseñada para auto-alojamiento en Docker / Synology NAS.

## Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **PWA:** Serwist (service worker, offline, instalable)
- **Backend:** API Routes de Next.js
- **BD:** SQLite + Prisma ORM
- **EXIF:** `exifr` (solo cliente)
- **IA:** DeepSeek API (`/api/generate-journal`) — misma clave que el resto de proyectos
- **Offline:** IndexedDB (`idb`)

## Inicio rápido (desarrollo)

```bash
cp .env.example .env
# Edita DEEPSEEK_API_KEY en .env (la misma clave que CarQuestions / mrWhite)

npm install
npm run db:push
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Despliegue con Docker (Synology NAS)

```bash
cp .env.example .env
# Configura DEEPSEEK_API_KEY y NEXT_PUBLIC_APP_URL

docker compose up -d --build
```

La app estará disponible en el puerto **3000**.

## Flujo de uso

1. **Crear viaje** — El organizador define título y alias; se genera código QR/enlace.
2. **Unirse** — Los demás entran con su alias (sin registro complejo).
3. **Subir fotos** — Selección masiva; EXIF (fecha, GPS) se lee en el dispositivo.
4. **Marcar transporte** — Foto de ida = inicio; foto de vuelta = fin del viaje.
5. **Añadir notas** — Por foto, día o trayecto, con autor.
6. **Offline** — Sin conexión, todo se guarda en IndexedDB y sincroniza al volver online.
7. **Generar crónica** — La IA redacta un artículo Markdown con las anécdotas del grupo.

## Estructura del proyecto

```
prisma/schema.prisma          # Modelos Travel, User, Photo, Note
src/components/PhotoUploadGrid.tsx   # Grid + lectura EXIF (cliente)
src/lib/exif.ts               # Utilidades exifr
src/lib/offline-db.ts         # IndexedDB para sync offline
src/app/api/generate-journal/ # Endpoint IA → Markdown
docker-compose.yml            # Despliegue NAS
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Ruta SQLite (`file:./data/travel.db`) |
| `DEEPSEEK_API_KEY` | Clave API de DeepSeek (o `OPENAI_API_KEY` como alias) |
| `OPENAI_BASE_URL` | Endpoint DeepSeek (`https://api.deepseek.com/v1`) |
| `OPENAI_MODEL` | Modelo (`deepseek-chat` por defecto) |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app |

## Licencia

MIT — código abierto y colaborativo.
