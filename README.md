# TravelToBlog — PWA colaborativa de diarios de viaje

Progressive Web App open-source para registrar viajes con fotos y notas, generar crónicas con IA orientadas a **blog** (historia y curiosidades del destino) y exportar HTML / PDF / Reel. Diseñada para auto-alojamiento en Docker / Synology NAS; dirección de producto: escala pública + freemium.

> **Agentes de IA:** leed primero [`docs/AGENT-HANDOFF.md`](docs/AGENT-HANDOFF.md) (estado completo, contrato de IA, roadmap). Índice de planes: [`docs/README.md`](docs/README.md).

## Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **PWA:** Serwist (service worker, offline, instalable)
- **Backend:** API Routes de Next.js
- **BD:** SQLite + Prisma ORM
- **EXIF:** `exifr` (cliente) + plugins nativos en APK Android
- **IA:** DeepSeek (crónica, sugerencias on-demand con semilla, export brief)
- **Mapas:** Mapbox (app) + Leaflet (exports)
- **Offline:** IndexedDB (`idb`)
- **Mobile:** Capacitor 6 (APK)

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
13. **Completar con IA (on-demand)** — Nota de foto, resumen del día y storyboard del Reel: tú escribes una semilla breve; la IA completa con lugares y curiosidades de blog, sin inventar la escena.
14. **Generar crónica** — Pipeline IA (intro/días/leyendas/conclusión o refine) en Markdown, tono blog + historia del destino anclada a vuestros sitios.
15. **Exportar** — HTML tipado, PDF, Reel Instagram (viaje o un día), copia ZIP completa del proyecto.
16. **Brief de export** — Indicaciones en lenguaje natural → plantillas/presets y knobs de presentación.

## Estructura del proyecto

```
docs/AGENT-HANDOFF.md                # Biblia para agentes (empezar aquí)
prisma/schema.prisma                 # Travel, User, Photo, Note, Place, GpsTrack
src/components/TravelWorkspaceTabs.tsx
src/lib/ai-blog-voice.ts             # Voz blog + anti-alucinación
src/lib/journal-pipeline.ts          # Crónica IA
src/lib/ai-suggest-*.ts              # Sugerencias on-demand
src/lib/export-*.ts + src/lib/export/  # HTML / PDF / Reel
src/lib/offline-db.ts                # IndexedDB
docker-compose.yml / Dockerfile.bookworm
scripts/deploy-synology.sh
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Ruta SQLite (`file:./data/travel.db`) |
| `DEEPSEEK_API_KEY` | Clave API de DeepSeek (o `OPENAI_API_KEY` como alias) |
| `OPENAI_BASE_URL` | Endpoint DeepSeek (`https://api.deepseek.com/v1`) |
| `OPENAI_MODEL` | Modelo (`deepseek-chat` por defecto) |
| `AI_SUGGESTIONS` | `0` desactiva `/api/ai/suggest-*` (crónica/brief siguen activos) |
| `NEXT_PUBLIC_APP_URL` | URL pública HTTP |
| `NEXT_PUBLIC_HTTPS_APP_URL` | URL HTTPS (GPS móvil, join, Capacitor) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Token Mapbox |

Lista completa y roadmap técnico: [`docs/AGENT-HANDOFF.md`](docs/AGENT-HANDOFF.md).

## Roadmap de producto

Dirección acordada (ver [`docs/plan-producto-escala.md`](docs/plan-producto-escala.md)):
escala pública, freemium y tipologías de experiencia más allá del viaje.

Exports con dirección creativa en lenguaje natural (HTML / vídeo / PDF): ver [`docs/plan-export-ai-brief.md`](docs/plan-export-ai-brief.md).

1. **Público general** — SaaS/cloud además del self-host en Synology.
2. **Freemium** — free usable + Plus de pago.
3. **Experiencias** — no solo viajes (boda, festival, fin de semana, etc.), mismo motor de captura y export.

Priorización operativa para agentes: sección 10 de [`docs/AGENT-HANDOFF.md`](docs/AGENT-HANDOFF.md).

## Licencia

MIT — código abierto y colaborativo.
