# Imagen ligera: build fuera del NAS; aquí solo se empaqueta el artefacto standalone.
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
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs node_modules/@prisma ./node_modules/@prisma
COPY --chown=nextjs:nodejs node_modules/prisma ./node_modules/prisma
COPY --chown=nextjs:nodejs package.json ./package.json

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
