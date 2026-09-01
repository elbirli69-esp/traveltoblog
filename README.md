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

### Opción A — script automático (desde tu red local)

Mismo patrón que `rodrigo-cv`: SSH al NAS y `docker compose`.

```bash
cp .env.example .env
# Edita DEEPSEEK_API_KEY en .env

npm run deploy:synology
```

Variables opcionales:

| Variable | Default |
|----------|---------|
| `NAS_HOST` | Auto: Tailscale → `192.168.1.137` |
| `NAS_TAILSCALE_HOST` | Hostname/IP Tailscale del NAS (ej. `nas.tail1234.ts.net`) |
| `TAILSCALE_AUTHKEY` | Auth key para unir el agente a tu tailnet |
| `NAS_SSH_KEY` | Clave privada SSH para `rodri_adm` (si no está en `~/.ssh`) |
| `NAS_PORT` | `2222` |
| `NAS_USER` | `rodri_adm` |
| `REMOTE_DIR` | `/volume1/docker/traveltoblog` |
| `APP_PORT` | `3000` |

La app quedará en `http://192.168.1.137:3000`.

### Opción B — manual en el NAS

```bash
cp .env.example .env
# Configura DEEPSEEK_API_KEY y NEXT_PUBLIC_APP_URL

docker compose up -d --build
```

## Flujo de uso

1. **Crear viaje** — El organizador define título y alias; se genera código QR/enlace. Puedes elegir **viaje en curso** o **viaje pasado** (con fechas de inicio y fin).
2. **Unirse** — Los demás entran con su alias (sin registro complejo).
3. **Guía viaje pasado** — Tras crear un viaje pasado, aparece un panel guiado (fechas → fotos → lugares → días → nota del viaje) con accesos directos a cada sección.
4. **Fotos** — Selección masiva; EXIF (fecha, GPS) se lee en el dispositivo. Ida/Vuelta marcan el inicio y fin del viaje. Fecha editable si el EXIF no coincide.
5. **Lugares** — Pins en el mapa (hotel, restaurante, mirador…). Fecha de visita opcional para ordenar el recorrido. El recorrido GPS y el “trayecto aéreo” del mapa son derivados, no se editan a mano.
6. **Días** — Notas por fecha del calendario del viaje.
7. **Viaje** — Notas globales (anécdotas del viaje completo) para intro/conclusión de la crónica.
8. **+ Añadir recuerdo** — CTA flotante con atajos (foto, estoy aquí, cómo fue el día, sobre el viaje). También `?add=photo|place|day|trip`.
9. **Notas de lugar** — `Note(type=PLACE)` ligadas al pin (migración desde `Place.comment` con `npm run db:migrate-place-notes`).
10. **Sinergias** — Notas de foto desde Días; Ida/Vuelta editable en galería; sugerencias foto↔lugar por GPS (~120 m); mapa con fotos clicables.
11. **Estados vacíos y checklist** — Cada pestaña invita a «+ Añadir recuerdo»; contadores en tabs; checklist opcional antes de generar la crónica.
12. **Offline** — Sin conexión, fotos/notas/lugares van a IndexedDB y sincronizan al volver online.
13. **Generar crónica** — La IA redacta un artículo Markdown con fotos, notas, lugares y vuelos del grupo.

## Estructura del proyecto

```
prisma/schema.prisma                 # Travel, User, Photo, Note, Place
src/components/TravelWorkspaceTabs.tsx  # Tabs: Fotos, Lugares, Días, Viaje
src/components/PhotoUploadGrid.tsx   # Grid + lectura EXIF (cliente)
src/lib/exif.ts                      # Utilidades exifr
src/lib/offline-db.ts                # IndexedDB para sync offline
src/app/api/generate-journal/        # Endpoint IA → Markdown
docker-compose.yml                   # Despliegue NAS
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
