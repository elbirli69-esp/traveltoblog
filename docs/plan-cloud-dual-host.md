# Plan: cloud dual-host (Vercel + Synology)

Plan de **implementación técnica** para desplegar TravelToBlog en Vercel sin romper el self-host en Synology. Complementa [`plan-producto-escala.md`](./plan-producto-escala.md) (eje A0–A5) y el handoff [`AGENT-HANDOFF.md`](./AGENT-HANDOFF.md).

**Estado:** 🚧 En implementación (2026-09-14) — D0–D4 en código; falta provisionar Neon/Blob y cutover.  
**Principio:** un solo repo, dos modos de runtime (`fs`+SQLite en NAS · `blob`+Postgres en Vercel).  
**Restricción:** default `STORAGE_DRIVER=fs` — Synology no cambia hasta activar cloud en Vercel.

---

## 1. Objetivo

| Meta | Detalle |
|------|---------|
| Uso diario desde Escocia / móvil | URL HTTPS pública (Vercel), sin Tailscale |
| Mantener Synology | Mismo código, `deploy:synology`, SQLite + `public/uploads` |
| Migrar álbumes existentes | Script one-shot NAS → Neon + Blob (IDs estables) |
| No fork | Drivers por env, no dos productos divergentes |

**Fuera de alcance de este plan (fase posterior):** auth OAuth/magic-link multi-tenant, freemium/Stripe, tipologías boda/festival, paridad PDF WeasyPrint en Vercel el día 1.

---

## 2. Decisión de stack (A0)

| Pieza | Elección | Alternativa | Notas |
|-------|----------|-------------|--------|
| App + API | **Vercel** (Next.js, Fluid Compute) | VPS Hetzner | Preferir Vercel: menos ops; APIs ya son route handlers |
| BD cloud | **Neon Postgres** (Marketplace) | another Marketplace Postgres | Prisma `provider` dual-friendly |
| Media | **Vercel Blob** | Cloudflare R2 | Blob = menos piezas al inicio; R2 si coste/egress duele |
| Auth (fase 1) | Alias + `shareCode` (igual que hoy) | Clerk / Auth0 más adelante | Suficiente para círculo cerrado en cloud |
| PDF | NAS completo; cloud **degradado o “abre en NAS”** | Worker externo WeasyPrint | No bloquear el resto |
| CDN fotos | URL firmada / pública Blob | Proxy `/api/photos/.../image` | Preferir URL directa Blob + cache |

**Criterio de cierre A0:** env documentados, proyecto Vercel creado, Neon + Blob provisionados (aunque vacíos).

---

## 3. Arquitectura dual

```
                    ┌─────────────────────────────────────┐
                    │         Mismo código Next.js         │
                    │  STORAGE_DRIVER=fs|blob              │
                    │  DATABASE_URL=sqlite|postgres        │
                    └──────────────┬──────────────────────┘
                                   │
           ┌───────────────────────┴───────────────────────┐
           ▼                                               ▼
 ┌─────────────────────┐                         ┌─────────────────────┐
 │ Synology (main/prod)│                         │ Vercel (cloud)       │
 │ SQLite volumen      │ ── migrate script ──►   │ Neon Postgres        │
 │ public/uploads      │ ── upload copy ─────►   │ Vercel Blob          │
 │ Tailscale Serve     │                         │ dominio público      │
 │ WeasyPrint Docker   │                         │ PDF: limitado / skip │
 └─────────────────────┘                         └─────────────────────┘
```

### Variables de entorno (borrador)

| Variable | NAS | Vercel |
|----------|-----|--------|
| `DATABASE_URL` | `file:./data/prod.db` (o ruta Docker) | Neon connection string |
| `STORAGE_DRIVER` | `fs` (default) | `blob` |
| `BLOB_READ_WRITE_TOKEN` | — | Vercel Blob |
| `NEXT_PUBLIC_APP_URL` | `https://syno-nas…` | `https://….vercel.app` / dominio |
| `OPENAI_API_KEY` / DeepSeek | igual | igual |
| `MAPBOX_TOKEN` | igual | igual |

Default **siempre** `STORAGE_DRIVER=fs` para no romper Docker existente.

---

## 4. Fases de implementación

### Fase 0 — Repo y seguridad (sin cambio funcional)

| ID | Trabajo | Criterio de hecho |
|----|---------|-------------------|
| D0.1 | Rama `cursor/cloud-dual-host-*` desde `main` | ✅ Rama de implementación |
| D0.2 | Doc env + secrets (este plan + `.env.example`) | ✅ Vars documentadas |
| D0.3 | Proyecto Vercel + Neon + Blob (vacíos) | 📋 Manual: crear en dashboard |
| D0.4 | Decidir: ¿cloud clona datos o sustituye uso diario? | ✅ Clon (NAS intacto) — §7 opción A |

**No merge a `main` obligatorio** hasta D1+ con default fs.

---

### Fase 1 — Abstracción de storage (bloqueante real)

**Problema hoy:** `photo-storage.ts`, `photo-upload.ts`, `photo-thumbnail.ts`, `travel-storage.ts`, `share-inbox.ts`, `project-backup.ts`, `src/app/uploads/[...path]/route.ts` asumen disco.

| ID | Trabajo | Archivos / zona | Criterio de hecho |
|----|---------|-----------------|-------------------|
| D1.1 | Interfaz `MediaStore` | `src/lib/media-store/*` | ✅ |
| D1.2 | Driver `fs` | default | ✅ smoke `npm run smoke:media-store` |
| D1.3 | Driver `blob` | `@vercel/blob` | ✅ código; falta token real |
| D1.4 | Cablear upload + sync + delete + thumbs | photo-upload / thumb / routes | ✅ |
| D1.5 | `Photo.url` lógico `/uploads/...` | uploads route vía store | ✅ |
| D1.6 | Thumbs en store | `photo-thumbnail` | ✅ |

**Regla:** ningún `path.join(process.cwd(), "public", "uploads")` fuera del driver `fs`.

**Merge parcial OK** si solo añade abstracción con default `fs` (cero cambio NAS).

---

### Fase 2 — Base de datos Postgres-compatible

| ID | Trabajo | Criterio de hecho |
|----|---------|-------------------|
| D2.1 | Auditar schema Prisma vs Postgres | ✅ `prisma/schema.cloud.prisma` |
| D2.2 | Dos schemas (sqlite NAS + postgres cloud) | ✅ `npm run db:push:cloud` |
| D2.3 | Neon vacío + migrate | 📋 Requiere credenciales Neon |
| D2.4 | Smoke CRUD en cloud | 📋 Tras D2.3 |
| D2.5 | Typecheck | ✅ `tsc --noEmit` |

**Nota:** mantener SQLite en NAS. Evitar features solo-Postgres o solo-SQLite en queries nuevas.

---

### Fase 3 — Deploy cloud usable (viaje nuevo)

| ID | Trabajo | Criterio de hecho |
|----|---------|-------------------|
| D3.1 | Config Vercel (`vercel.json`; standalone solo fuera de Vercel) | ✅ |
| D3.2 | Crear viaje, unirse por código, notas, lugares, mapa | 📋 Tras deploy preview |
| D3.3 | Subida fotos (incl. HEIC) en chunks existentes | 📋 Tras Blob token |
| D3.4 | Offline sync: cola IndexedDB → `/api/sync` cloud | 📋 Tras preview |
| D3.5 | Export HTML + Reel (cliente) | 📋 Tras preview |
| D3.6 | PDF: 501 controlado en cloud | ✅ `PDF_EXPORT_ENABLED` / auto-off en Vercel |
| D3.7 | PWA / Capacitor: documentar URL cloud de prueba | 📋 Pendiente |

---

### Fase 4 — Migración de álbumes existentes

**Entrada:** volumen NAS (`prod.db` o path real + `public/uploads`).  
**Salida:** Neon + Blob con mismos `id` (cuid) para no romper deep links internos.

| ID | Trabajo | Criterio de hecho |
|----|---------|-------------------|
| D4.1 | Inventario: nº travels, photos, tamaño uploads | Informe en `/tmp` o doc |
| D4.2 | Script `scripts/migrate-nas-to-cloud.ts` | ✅ dry-run + `--apply` (media); filas BD parcial |
| D4.3 | Copiar filas Prisma en orden FK (Travel → User → Place → Photo → Note → GpsTrack) | Conteos NAS == Neon |
| D4.4 | Subir ficheros a Blob; verificar sample URLs | 100% o reporte de fallos |
| D4.5 | Reconciliar `Photo.url` / keys | Galería cloud = mismas fotos |
| D4.6 | Checklist post-migración por viaje (Scotland, etc.) | Sign-off manual |

**Modo recomendado:** **clon** (NAS intacto). Cloud = copia. Sync bidireccional **no** en v1.

**Rollback:** borrar proyecto Neon/Blob o no usar URL cloud; NAS sigue siendo prod.

---

### Fase 5 — Dual operación y corte suave

| ID | Trabajo | Criterio de hecho |
|----|---------|-------------------|
| D5.1 | URL canónica de uso diario = Vercel (o dominio) | Documentado en handoff |
| D5.2 | NAS: backup semanal / export ZIP / `project-backup` | Runbook |
| D5.3 | Política: ¿nuevos viajes solo en cloud? | Decisión escrita |
| D5.4 | Merge a `main` de drivers + docs; `deploy:synology` sigue default `fs` | Deploy NAS de verificación |
| D5.5 | (Opcional) dominio custom + HTTPS | App Store / bookmark estables |

---

### Fase 6 — Diferido (no bloquea Escocia)

| ID | Trabajo |
|----|---------|
| D6.1 | Auth fuerte (A1 escala) |
| D6.2 | R2 si Blob sale caro |
| D6.3 | PDF parity (container/job) |
| D6.4 | Freemium (F*) |
| D6.5 | Self-host imagen Docker “cloud-parity” documentada (A5) |

---

## 5. Orden de ejecución (checklist corta)

```
D0  Provisionar Vercel + Neon + Blob; rama; docs env
D1  MediaStore (fs default) → cablear APIs → driver blob
D2  Prisma Postgres-compatible → Neon migrate
D3  Smoke E2E cloud (viaje nuevo)
D4  Script migración álbumes + verificación
D5  Uso diario cloud; NAS backup; merge seguro a main
D6  Auth / PDF / freemium (después)
```

Dependencias: **D1 antes o en paralelo temprano con D2**; **D3 necesita D1+D2**; **D4 después de D3**.

---

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| HEIC / thumbs asumen filesystem | Galería rota en cloud | Generar thumb en put; guardar en Blob |
| Body size / timeouts upload | Fallos Tailscale→cloud distintos | Mantener chunks (ya en sync); Blob client upload directo si hace falta |
| Prisma SQLite vs Postgres divergencia | Migrates rotos | Evitar SQL raw; test ambos en CI cuando sea viable |
| WeasyPrint ausente en Vercel | PDF roto | Feature flag / copy claro |
| Doble fuente de verdad NAS+cloud | Datos divergentes | Clon one-shot; “write primary” = cloud tras D5 |
| Secretos en chat/CI | Fuga | Solo Vercel/Neon dashboards + GitHub secrets |
| Coste Blob con muchos originales | Sorpresa factura | Inventario D4.1; lifecycle/thumb-only export más adelante |

---

## 7. Política de datos (decidir en D0.4)

**Opción A — Clon (recomendada al inicio)**  
- NAS = prod hasta D5  
- Cloud = copia migrada  
- Escrituras nuevas: preferir cloud tras validación  

**Opción B — Cutover**  
- Tras D4, solo cloud; NAS read-only / backup  

**Opción C — Sync continuo**  
- Fuera de alcance v1 (complejidad alta)

---

## 8. Criterios de éxito globales

- [ ] Desde Escocia, viaje cloud fluido (fotos, lugares, notas) sin Tailscale.
- [ ] `npm run deploy:synology` + uso NAS sin regresiones (driver `fs`).
- [ ] Álbumes migrados visibles en cloud con mismas entidades.
- [ ] Un solo repo; features nuevas no asumen solo disco.
- [ ] PDF: comportamiento documentado en cada host.
- [ ] Runbook de migración y rollback en este doc o handoff.

---

## 9. Mapa de código (puntos de toque)

| Área | Rutas / libs |
|------|----------------|
| Storage | `src/lib/photo-storage.ts`, `photo-upload.ts`, `photo-thumbnail.ts`, `travel-storage.ts`, `share-inbox.ts`, `project-backup.ts` |
| HTTP media | `src/app/api/photos/**`, `src/app/api/sync/route.ts`, `src/app/uploads/[...path]/route.ts` |
| BD | `prisma/schema.prisma`, `src/lib/prisma.ts` |
| Export | `src/lib/export-pdf*`, `export-html*`, `export-reel*` (URLs de imagen) |
| Deploy | `scripts/deploy-synology.sh`, nuevo config Vercel, `scripts/migrate-nas-to-cloud.*` |
| Offline | `src/lib/offline-sync.ts`, `offline-db.ts` |

---

## 10. Testing por fase

| Fase | Automated | Manual |
|------|-----------|--------|
| D1 | Typecheck; test contrato MediaStore mock | NAS: upload, thumb, borrar viaje |
| D2 | `prisma validate`; migrate dry | CRUD API en preview |
| D3 | — | E2E viaje nuevo en móvil Escocia |
| D4 | Script dry-run counts | Spot-check 3 viajes + GPS + lugares |
| D5 | Deploy NAS post-merge | Comparar smoke NAS vs cloud |

Walkthrough: capturas/vídeo de galería cloud + mapa tras migración.

---

## 11. Relación con otros planes

| Doc | Relación |
|-----|----------|
| [`plan-producto-escala.md`](./plan-producto-escala.md) | Este plan **ejecuta A0–A3 + A5 parcial**; A1/A4 y freemium siguen allí |
| [`AGENT-HANDOFF.md`](./AGENT-HANDOFF.md) | Actualizar §9–§10 cuando D0/D5 avancen |
| Planes export | HTML/Reel priorizan URLs portables; PDF parity = D6 |

---

## Historial

| Fecha | Nota |
|-------|------|
| 2026-09-14 | Plan creado: dual-host Vercel+Synology, fases D0–D6, migración clon. |
| 2026-09-14 | Implementación: MediaStore fs/blob, schema.cloud, migrate script, PDF gate, vercel.json. |
