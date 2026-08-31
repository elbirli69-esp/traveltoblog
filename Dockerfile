# Imagen Alpine para Synology NAS — sin apt en build (DNS del NAS suele fallar).
# Prisma Client se genera en el host con binaryTarget musl.
# PDF/WeasyPrint: usar Dockerfile.bookworm donde haya red en el build.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/data/travel.db

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data /app/public/uploads \
  && chown -R nextjs:nodejs /app/data /app/public/uploads

COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static
COPY --chown=nextjs:nodejs public ./public
# Manifest dinámico vía app/manifest.ts — no servir copia estática obsoleta
RUN rm -f ./public/manifest.webmanifest
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs node_modules/@prisma ./node_modules/@prisma
COPY --chown=nextjs:nodejs package.json ./package.json
COPY --chown=nextjs:nodejs scripts ./scripts

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
