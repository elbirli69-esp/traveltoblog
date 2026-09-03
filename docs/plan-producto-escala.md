# Plan: escala a público general, freemium y experiencias

Plan estratégico de producto (anotado 2026-09-03). Complementa los planes técnicos ya cerrados o en curso (`plan-contenido-unificado.md`, `plan-export-magazine.md`).

## Decisión de producto

TravelToBlog deja de pensarse **solo** como app self-hosted en Synology para un círculo cerrado. La dirección acordada es:

1. **Escalar a público general** — SaaS / cloud accesible, no únicamente NAS.
2. **Modelo freemium** — capa gratis usable + Plus de pago.
3. **Abrir a otras experiencias** — no solo viajes: bodas, festivales, fines de semana, etc.

El núcleo del producto se mantiene: **documentar en grupo una experiencia acotada en el tiempo** (fotos, lugares/momentos, notas, recorrido, crónica, export).

---

## Estado actual (baseline)

| Aspecto | Hoy |
|---------|-----|
| Hosting | Docker en Synology NAS (+ Tailscale) |
| Público | Privado / invitados por código |
| Monetización | Ninguna (open source / uso propio) |
| Dominio de contenido | Viajes (live + past trip guide) |
| Diferenciadores | Colaboración, EXIF/GPS, export Magazine/PDF/reel, PWA + APK |

Synology **sigue siendo válido** como modo self-host / power users; deja de ser el único camino.

---

## Eje 1 — Público general (salir del NAS-only)

### Objetivo

Cualquiera puede crear cuenta/viaje en una URL pública, invitar al grupo y exportar, sin instalar Docker.

### Implicaciones técnicas (alto nivel)

| Pieza actual | Dirección |
|--------------|-----------|
| SQLite en disco | Postgres gestionado (p. ej. Neon) |
| Fotos en `public/uploads` | Object storage (R2 / S3 / Blob) |
| App monolito Next | Vercel u host managed; o VPS barato (Hetzner) si se prioriza coste/disco |
| Deploy solo Synology | CI → cloud + opción self-host documentada |
| APK / PWA | Apuntar a URL HTTPS pública |

### Fases sugeridas

| Fase | Qué | Estado |
|------|-----|--------|
| A0 | Decisión hosting (Vercel+Neon+R2 vs VPS) y presupuesto | 📋 Anotado |
| A1 | Auth ligera (email mágico / OAuth) + multi-tenant seguro | 📋 Pendiente |
| A2 | Migrar media a object storage | 📋 Pendiente |
| A3 | Migrar BD a Postgres | 📋 Pendiente |
| A4 | Dominio público, onboarding, App Store / Play | 📋 Pendiente |
| A5 | Mantener imagen Docker self-host como producto paralelo | 📋 Pendiente |

### Criterios de hecho (escala pública)

- [ ] Usuario nuevo crea experiencia y sube fotos sin acceso al NAS.
- [ ] Invitados se unen por enlace/código desde internet.
- [ ] Fotos y datos persisten tras redeploy.
- [ ] Self-host Synology sigue documentado y desplegable.

---

## Eje 2 — Freemium

### Objetivo

Adquisición amplia con free tier; ingresos con suscripción anual (referencia mercado: Polarsteps Plus ~€30/año, Wanderlog Pro ~$40/año).

### Boceto de planes (a validar)

| Plan | Precio orientativo | Incluye (borrador) |
|------|--------------------|--------------------|
| **Free** | 0 € | 1–2 experiencias, cupo de fotos, export básico, colaboradores limitados |
| **Plus** | ~€29–39/año (o ~€4–6/mes) | Experiencias ilimitadas, crónica IA, export Magazine/PDF/reel premium, más storage y colaboradores |
| **Self-host** | One-time o donación | Misma app sin límites de SaaS; sin soporte cloud |

### Monetización secundaria (posterior)

- Libros / print-on-demand a partir del export.
- (Opcional) afiliados travel solo si hay blogs públicos con tráfico.
- B2B / white-label (agencias, eventos) más adelante.

### Qué no hacer

- Publicidad en el diario (fotos íntimas + ads = rechazo).
- Paywall duro antes del “aha” (crear → fotos → ver recorrido/export).

### Fases sugeridas

| Fase | Qué | Estado |
|------|-----|--------|
| F0 | Definir límites free vs Plus y precios | 📋 Anotado |
| F1 | Entitlements en backend (límites por plan) | 📋 Pendiente |
| F2 | Checkout (Stripe) + portal de cliente | 📋 Pendiente |
| F3 | Paywall en export premium / IA / storage | 📋 Pendiente |
| F4 | Métricas: activación, trial→paid, churn | 📋 Pendiente |

---

## Eje 3 — Experiencias (no solo viaje)

### Objetivo

El mismo motor sirve para **cualquier experiencia acotada en el tiempo documentada en grupo**, empezando por viaje y abriendo tipologías.

### Principio

- **No** diluir ya la marca a “cualquier cosa del mundo”.
- **Sí** tipologías sobre el mismo modelo (`Travel` / “experiencia”).
- Viaje sigue siendo la punta de lanza; el primer vertical extra a probar: **boda fin de semana** o **festival**.

### Tipologías candidatas

| Tipo | Encaje | Prioridad sugerida |
|------|--------|--------------------|
| Viaje (live / pasado) | Núcleo actual | P0 — mantener |
| Boda / celebración (2–3 días) | Alto (viral + pago libro) | P1 — piloto |
| Festival / concierto | Alto (volumen / redes) | P1 o P2 |
| Quedada / fin de semana | Alto | P2 |
| Offsite / evento corporativo | Medio (B2B) | P3 |

### Cambios de producto por tipología (mínimos)

Al crear:

```
¿Qué estás documentando?
  · Viaje
  · Boda / celebración
  · Festival / evento
  · Quedada / fin de semana
```

Por tipo: copy, tipos de “lugar/momento”, plantilla Magazine/PDF, guía de onboarding (como `PastTripGuide` pero genérica).

### Fases sugeridas

| Fase | Qué | Estado |
|------|-----|--------|
| E0 | Decisión: tipologías + no renombrar marca hasta tracción del 2.º vertical | 📋 Anotado |
| E1 | Campo `experienceType` (o equivalente) en modelo + UI de creación | 📋 Pendiente |
| E2 | Taxonomías y copy por tipo (boda / festival) | 📋 Pendiente |
| E3 | Plantillas export Magazine/PDF por tipo | 📋 Pendiente |
| E4 | Guía guiada genérica (“reconstruye el fin de semana”) | 📋 Pendiente |
| E5 | Evaluar rename de marca solo si boda/festival aportan tracción medible | 📋 Pendiente |

### Criterios de hecho (experiencias)

- [ ] Usuario elige tipo al crear; UI y export no hablan solo de “viaje” cuando el tipo es otro.
- [ ] Al menos una tipología no-viaje (boda o festival) usable de punta a punta.
- [ ] Viaje no pierde calidad ni claridad.

---

## Orden de ejecución recomendado

```
1. Clarificar free vs Plus (F0) y tipologías (E0)     ← decisión de producto
2. Cloud mínimo usable (A0–A3)                         ← desbloquea público
3. Freemium técnico (F1–F3)                            ← monetiza
4. Piloto tipología boda o festival (E1–E3)            ← amplía mercado
5. Self-host + print / B2B                             ← canales extra
```

No hace falta terminar toda la nube antes de prototipar `experienceType` en el NAS; sí hace falta nube (o VPS público) antes de freemium real con pagos.

---

## Fuera de alcance de este plan

- Competir con Wanderlog/TripIt en planning/reservas.
- GPS pasivo estilo Polarsteps (valorable después, no bloqueante).
- Ads.
- Reescritura completa de marca/app sin datos del segundo vertical.

---

## Referencias internas

- Diferenciación vs Canva/Wix/Jimdo/Webnode: conversación de producto 2026-09-02.
- Estudio de mercado / monetización: conversación 2026-09-03 (Polarsteps Plus, Wanderlog Pro, libros, self-host).
- Expansión a eventos (boda, festival): conversación 2026-09-03.

## Historial

| Fecha | Nota |
|-------|------|
| 2026-09-03 | Plan creado: escala pública, freemium, experiencias más allá del viaje. |
