# TravelToBlog — handoff para agentes de IA

Documento **canónico** para que cualquier agente (o humano) conozca el estado real del producto, la arquitectura, las reglas de IA ya decididas y el roadmap hacia robustez y público general.

**Última actualización:** 2026-09-08  
**Repo:** `elbirli69-esp/traveltoblog`  
**Hosting actual:** Docker en Synology NAS + Tailscale HTTPS (`https://syno-nas.tailf9872a.ts.net`)  
**Idioma de producto / UI:** español (peninsular)

---

## 0. Cómo usar este documento

| Si necesitas… | Lee… |
|---------------|------|
| Visión y monetización | §1 + [`plan-producto-escala.md`](./plan-producto-escala.md) |
| Qué hay ya construido | §2–§6 |
| Reglas de IA (anti-alucinación + blog) | §7 |
| Export HTML/PDF/Reel | §8 + planes `plan-export-*.md` |
| Deploy / entorno | §9 |
| Qué hacer después (priorizado) | §10 |
| Convenciones de agente Cursor | §11 |

**Regla operativa del propietario:** no desplegar al NAS salvo petición explícita. Merge/PR sí; `npm run deploy:synology` solo cuando lo pida.

---

## 1. Qué es el producto

**TravelToBlog** es una PWA colaborativa para **documentar en grupo una experiencia acotada en el tiempo** (hoy: viajes), con:

1. Captura (fotos/vídeo, lugares, notas, GPS, días)
2. Crónica Markdown generada/refinada con IA
3. Export (HTML blog, PDF álbum, Reel Instagram, copia ZIP completa)

**No es** un clon de Polarsteps/Instagram: el diferencial es colaboración ligera (alias + código), EXIF/GPS, crónica editorial y exports ricos self-host.

**Dirección de producto acordada** (no solo NAS):

1. Escala a público general (SaaS)
2. Freemium
3. Tipologías más allá del viaje (boda, festival…) — mismo motor

Detalle: [`plan-producto-escala.md`](./plan-producto-escala.md).

---

## 2. Stack y layout del repo

| Capa | Tecnología |
|------|------------|
| App | Next.js 15 App Router, React 19, TypeScript, Tailwind 4 |
| BD | SQLite + Prisma 6 |
| IA | OpenAI SDK → DeepSeek (`deepseek-chat`) |
| Mapas | Mapbox GL (app) + Leaflet (exports estáticos) |
| PWA | Serwist |
| Android | Capacitor 6 + plugins nativos EXIF/share |
| PDF | WeasyPrint (Docker Bookworm) |
| Reel | mediabunny (encode cliente) |
| Deploy | `scripts/deploy-synology.sh` → Docker host network + Tailscale Serve |

```
src/app/           # páginas + API routes
src/components/    # UI
src/lib/           # dominio (AI, export, sync, photos…)
prisma/            # schema SQLite
docs/              # planes + este handoff
scripts/           # deploy, tests, android, pdf
android/           # Capacitor nativo
docker/            # debs WeasyPrint offline
```

---

## 3. Modelo de dominio (Prisma)

Entidades clave en `prisma/schema.prisma`:

| Modelo | Rol |
|--------|-----|
| **Travel** | “Sala” compartida: `shareCode`, fechas, tipología, crónica (`journalMarkdown` + previous/undo), brief, prefs de export |
| **User** | Participante por `alias` único en el viaje; **sin passwords**. `creatorId` en Travel |
| **Photo** | IMAGE/VIDEO, EXIF datetime/GPS, `placeId`, `selected`, `highlightScore` (0–10, **0 = sin puntuar**), flags ida/vuelta, `localId` offline |
| **Note** | `PHOTO` \| `DAY` \| `TRIP` \| `PLACE` |
| **Place** | Pin tipado (hotel, museo, mirador…), `visitedAt`, notas PLACE |
| **GpsTrack** | Trail opcional JSON + `includeInExport` |

**Sesión cliente:** `localStorage` `traveltoblog_session` = `{ userId, alias, travelId }`. Historial reciente aparte. Autorización blanda (casi todo por `userId` en body); borrar viaje exige creador.

---

## 4. Navegación y flujos UX

### Global

- `/` — crear viaje, recientes (local + servidor), unirse, importar copia, APK
- `/join/[code]` — alias + código
- `/travel/[id]` — workspace
- `/travel/[id]/journal` — crónica
- `/travel/[id]/export` — HTML | PDF | Video | Copia
- `/share/receive` — Web Share Target
- `/download/android` — APK

### Workspace (`TravelWorkspaceNav` + tabs)

| Zona | Contenido |
|------|-----------|
| **Recuerdos** | Tabs: Fotos, Lugares, Días, Cronología, Viaje |
| **Crónica** | Generar/refinar IA, editar Markdown |
| **Exportar** | HTML, PDF, Reel, backup ZIP |

CTA flotante **+ Añadir recuerdo** (`AddMemorySheet`). Viajes pasados: guía paso a paso (`PastTripGuide`).

---

## 5. Capacidades ya implementadas (checklist)

### Captura y colaboración

- [x] Crear / unirse por código + QR
- [x] Fotos masivas con EXIF (fecha/GPS) en cliente; fecha editable
- [x] Vídeo + poster; límites tamaño en `media-limits.ts`
- [x] Ida/vuelta (transporte) para acotar el viaje
- [x] Lugares tipados en mapa Mapbox; enlace foto↔lugar (manual + auto ~120 m)
- [x] Notas PHOTO / DAY / TRIP / PLACE
- [x] Trail GPS opcional
- [x] Offline IndexedDB → sync (`/api/sync`, `localId`)
- [x] PWA instalable + share-target
- [x] APK Android (EXIF nativo; GPS a menudo strippeado en picker web)
- [x] Lista de viajes del servidor en home + Unirme
- [x] Backup/import proyecto ZIP (`traveltoblog-project` v1)

### IA

- [x] Crónica generate + refine (pipeline multi-paso) + undo
- [x] Estilos crónica: **Vivo** (`narrative`) / **Fiel a las notas** (`factual`)
- [x] Sugerir nota de foto (seed obligatorio ≥8)
- [x] Completar resumen del día (seed ≥12)
- [x] Storyboard Reel (seed ≥12; IDs validados)
- [x] Export brief → directivas + match de templates/presets
- [x] Voz compartida de **blog** + anti-alucinación visual (`ai-blog-voice.ts`)
- [x] Flag `AI_SUGGESTIONS=0` apaga solo las 3 rutas `/api/ai/suggest-*`

### Export

- [x] HTML tipado (templates magazine/visual/editorial/dark + themes + type packs)
- [x] PDF WeasyPrint + presets
- [x] Reel 9:16 H.264 (viaje o un día) + presets + storyboard aplicado
- [x] Mapa en HTML/PDF/Reel (Leaflet assets locales en ZIP)
- [x] Brief creativo en lenguaje natural

### Ops

- [x] Deploy Synology automatizado
- [x] HTTPS vía Tailscale Serve (necesario para geolocalización móvil)

---

## 6. Mapa de APIs (agrupado)

| Grupo | Rutas principales |
|-------|-------------------|
| Travels | `/api/travels`, `/api/travels/[id]`, journal, export-prefs, warnings, timeline, photos*, gps-tracks, suggest-type |
| Join | `/api/join/[code]` |
| CRUD | `/api/photos`, `/api/notes`, `/api/places`, `/api/gps-tracks/[id]` |
| IA | `/api/generate-journal`, `/api/ai/suggest-photo-note`, `…/suggest-day-summary`, `…/suggest-reel-storyboard`, `/api/export-brief` |
| Export | `/api/export-html`, `export-pdf`, `export-reel`, `export-project`, `import-project` |
| Maps | `/api/mapbox/directions` |
| Sync/Share | `/api/sync`, `/api/share-target` |

---

## 7. Inteligencia artificial — contrato de producto

### Principios (acordados tras alucinaciones en notas de foto)

1. **On-demand / manual** — el usuario pulsa; no hay auto-llamadas masivas.
2. **Seed-first** en sugerencias cortas — el usuario describe; la IA completa.
3. **Sin vision** por defecto — la IA **no ve** la imagen; solo texto/metadatos.
4. **Blog voice** — audiencia pública: curiosidades de historia/tradiciones/costumbres ancladas al **lugar nombrado** o al **título del viaje** (p. ej. Krakow + Wawel).
5. **Anti-alucinación** — prohibido inventar lo que se ve en la foto, visitas no registradas o anécdotas personales falsas.
6. **Anclaje** — toda curiosidad debe ligarse a un nombre presente en semilla / lugar / cerca / título.

Código compartido: `src/lib/ai-blog-voice.ts` → `buildTravelBlogVoiceBlock()`.

### Superficies

| Superficie | Seed | Gate `AI_SUGGESTIONS` | Archivos |
|------------|------|------------------------|----------|
| Nota de foto | ≥8 chars + tono | Sí | `ai-suggest-photo-note.ts`, `SuggestPhotoNote.tsx` |
| Resumen del día | ≥12 chars | Sí | `ai-suggest-day-summary.ts`, `SuggestDaySummary.tsx` |
| Storyboard Reel | ≥12 chars | Sí | `ai-suggest-reel-storyboard.ts`, `ExportReelPanel.tsx` |
| Crónica | brief opcional | **No** (solo API key) | `journal-pipeline.ts`, `GenerateJournalButton.tsx` |
| Export brief | texto libre | **No** | `export-brief.ts` |

### Crónica (pipeline)

Pasos generate: `context → intro → days → captions → conclusion → assemble`  
Refine (si ya hay markdown): `context → refine`  
Estilos: `narrative` (Vivo) / `factual` (Fiel).  
Sanitizers quitan blockquotes y citas literales de notas (esas van al recorrido del export).

### Riesgos IA conocidos

- Curiosidades “conocidas” sin KB → residual de hechos dudosos → mitigar con tono sobrio + anclaje (ya en prompts); futuro: retrieval / allowlist de destinos.
- Sin cuotas ni auth fuerte → abuso de tokens en despliegue público.
- Caché in-memory de suggests: por proceso, se pierde al reiniciar.
- `AI_SUGGESTIONS` no cubre crónica ni export-brief.

---

## 8. Export — estado y docs relacionados

| Formato | Panel | Libs clave | Catálogos |
|--------|-------|------------|-----------|
| HTML | `ExportHtmlPanel` | `export-html.ts`, `export-pipeline.ts` | `template-catalog`, themes, type-packs |
| PDF | `ExportPdfPanel` | `export-pdf*.ts` + WeasyPrint | `pdf-preset-catalog` |
| Reel | `ExportReelPanel` | `export-reel*.ts` | `reel-preset-catalog` |
| Backup | `ExportProjectPanel` | `project-backup.ts` | formato ZIP v1 |

Planes técnicos: `plan-export-ai-brief.md`, `plan-export-template-catalog.md`, `plan-export-reel-preset-catalog.md`, `plan-export-quality-16.md`, `plan-export-next.md`, `plan-export-magazine.md`, `plan-export-html-next.md`.

Prefs persistidas en Travel: `exportBrief`, `exportBriefCache`, ids de template/theme/type/reel/pdf.

---

## 9. Entorno, env y deploy

### Variables críticas

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | SQLite |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | IA |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | Endpoint/modelo |
| `AI_SUGGESTIONS` | `0` desactiva suggest-* |
| `NEXT_PUBLIC_APP_URL` | Origen HTTP |
| `NEXT_PUBLIC_HTTPS_APP_URL` | HTTPS (GPS, join, Capacitor) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapas |
| `WEASYPRINT_BIN` | PDF |
| Deploy: `NAS_*`, `TAILSCALE_AUTHKEY`, `NAS_SSH_KEY` | Synology |

### Deploy

```bash
npm run deploy:synology
```

Compila Next en local (standalone), sincroniza al NAS, `docker compose` con `Dockerfile.bookworm`, Tailscale Serve → HTTPS.

**Datos:** volúmenes Docker conservan SQLite y uploads; no borrar a la ligera.

### Tests útiles

```bash
npm run test:ai-blog-voice
npm run test:ai-suggest-photo-note
npm run test:ai-suggest-day-summary
npm run test:ai-suggest-reel-storyboard
npx tsx scripts/test-journal-pipeline.mjs
npm run test:project-backup
npm run test:timeline
```

---

## 10. Siguientes pasos (priorizados para agentes)

Orden pensado para **robustez → calidad → público**. No estimar calendario; sí impacto técnico.

### P0 — Robustez / seguridad (antes de abrir a desconocidos)

1. **Auth real o al menos rate-limit + secret** en rutas IA y mutaciones sensibles.
2. **Entitlements / cuotas** de tokens IA y storage (base freemium F1).
3. **Kill-switch global LLM** (hoy `AI_SUGGESTIONS` incompleto; cubrir journal + brief).
4. **Hardening delete/export** — verificar membership en todas las rutas (hoy confianza en `userId` del body).
5. **Backups automáticos** del volumen SQLite/uploads en NAS.

### P1 — Calidad de contenido / blog

Ver plan dedicado: [`plan-blog-editorial.md`](./plan-blog-editorial.md).

1. Merge y uso estable de voz blog (`ai-blog-voice` + crónica) — validar en viaje real.
2. **Blog completeness (B1)** — panel de huecos + cola «fotos sin nota» ✅ en `main`.
3. **Semillas guiadas + chips (B2)** — placeholders/chips por `PlaceType`, mañana/tarde/cena, «usar última nota», chips de intención en `journalBrief` (`blog-seed-prompts`).
4. **Guía lector + arco (B3)** — HTML Magazine «Si vais, no os perdáis…» (≤5 lugares + tip PLACE); arco gancho/tips/cierre en pipeline; título público opcional en export. ✅ en `main`.
5. **Preview HTML (B4)** — vista previa a pantalla casi completa antes del ZIP. ✅ en `main` (atajos de audiencia retirados: las pestañas HTML/PDF/Vídeo bastan).
6. **Ficha destino (B5)** — `destinationName` + temas opcionales; alimentan voz blog y completeness (`destination_fiche`).

### P2 — Producto export

1. Seguir [`plan-export-next.md`](./plan-export-next.md) y quality-16 pendientes.
2. Preview más fiel HTML/PDF/Reel antes de descargar.
3. Tipologías de experiencia en UI (boda/festival) sobre el mismo schema — ver eje 3 de escala.

### P3 — Público general (SaaS)

Del [`plan-producto-escala.md`](./plan-producto-escala.md):

| Fase | Qué |
|------|-----|
| A0 | Decisión hosting (Vercel+Neon+R2 vs VPS) |
| A1 | Auth (magic link / OAuth) + multi-tenant |
| A2 | Object storage para media |
| A3 | Postgres |
| A4 | Dominio, onboarding, stores |
| A5 | Self-host Docker como producto paralelo |
| F0–F4 | Límites free/Plus, Stripe, paywall, métricas |

### P4 — Mobile

1. Flujo APK estable para GPS (documentar limitaciones del picker).
2. Capacitor apuntando a URL cloud cuando exista SaaS.
3. Share intent / share-target pulidos.

### P5 — Deuda técnica conocida

- Warnings ESLint en export-html / PhotoUpload (vars no usadas).
- README aún describe IA solo como `generate-journal` (actualizar al tocar onboarding docs).
- Cachés IA in-process.
- SQLite + ficheros locales no escalan multi-instancia.

---

## 11. Convenciones para agentes Cursor en este repo

- Ramas: `cursor/<nombre-descriptivo>-6db5` (minúsculas).
- Base PR: `main`. PRs con `ManagePullRequest` (no `gh pr create`).
- `gh` solo lectura.
- Commits claros; push `-u origin <branch>`.
- **No deploy NAS** sin petición del usuario.
- UI: español; evitar layouts genéricos AI-slop en páginas nuevas (ver user rules de diseño).
- Preferir Context7 MCP si se pide documentación de librerías externas.
- Planes largos viven en `docs/`; no duplicar novelas en el PR body.

### PRs / temas recientes relevantes

- Seed-first: nota foto, resumen día, storyboard Reel
- Anti-alucinación visual en notas
- Voz blog + curiosidades (incl. crónica) — rama `cursor/ai-blog-curiosities-6db5`
- Home lista viajes servidor; backup/import proyecto
- Export quality, HTML ZIP assets, Reel day-scope / memories preset

---

## 12. Índice de documentación

| Doc | Propósito |
|-----|-----------|
| **Este archivo** | Handoff completo para agentes |
| [`plan-blog-editorial.md`](./plan-blog-editorial.md) | Blog editorial + huecos (comida, personal, tips…) |
| [`plan-producto-escala.md`](./plan-producto-escala.md) | SaaS, freemium, tipologías |
| [`plan-contenido-unificado.md`](./plan-contenido-unificado.md) | UX captura unificada |
| [`plan-export-ai-brief.md`](./plan-export-ai-brief.md) | Brief → directivas |
| [`plan-export-template-catalog.md`](./plan-export-template-catalog.md) | Catálogo HTML |
| [`plan-export-reel-preset-catalog.md`](./plan-export-reel-preset-catalog.md) | Catálogo Reel |
| [`plan-export-quality-16.md`](./plan-export-quality-16.md) | Checklist calidad export |
| [`plan-export-next.md`](./plan-export-next.md) | Backlog export |
| [`plan-export-magazine.md`](./plan-export-magazine.md) | Línea magazine HTML |
| [`plan-export-html-next.md`](./plan-export-html-next.md) | Follow-ups HTML |
| [`../README.md`](../README.md) | Quickstart humano |

---

## 13. Definición de “listo para público general” (mínimo)

Un agente no debería declarar “listo para SaaS” sin:

- [ ] Auth + aislamiento multi-tenant verificado
- [ ] Media en object storage + BD gestionada
- [ ] Cuotas IA/storage y kill-switch total
- [ ] Rate limiting y auditoría básica
- [ ] Onboarding &lt; 5 min hasta primera foto + export básico
- [ ] Self-host documentado como camino paralelo
- [ ] Legal mínimo (privacidad fotos, ToS) — pendiente de redactar

Hasta entonces el producto es **excelente self-host / círculo de confianza**, no marketplace abierto.
