# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Supabase-URL wird nur zum Auflösen des Image-Hostnamens in astro.config.mjs benötigt.
# Der eigentliche Wert wird zur Laufzeit via process.env übergeben.
ARG SUPABASE_URL=""
ENV SUPABASE_URL=$SUPABASE_URL

RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 astro

COPY --from=builder --chown=astro:nodejs /app/dist ./dist
COPY --from=builder --chown=astro:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=astro:nodejs /app/package.json ./package.json

USER astro

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4343

EXPOSE 4343

CMD ["node", "./dist/server/entry.mjs"]
