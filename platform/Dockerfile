# Multi-Stage: Next.js + Express Backend in einem Container (Migrationsphase)
#
# Phase A (Jetzt): Next.js auf Port 3001, Express auf Port 3100
#                  Nginx/Traefik routet an Next.js, Next.js proxied API an Express
#
# Phase B (Nach Migration): Nur Next.js, kein Express mehr

# ─── Stage 1: Next.js Build ──────────────────────────────────────────────────
FROM node:20.18.1-alpine AS nextjs-builder
RUN apk add --no-cache libc6-compat
WORKDIR /nextjs
COPY app/package*.json ./
RUN npm ci
COPY app/ .

ARG NEXT_PUBLIC_API_BASE=""
ARG NEXT_PUBLIC_PUBLIC_BOOKING_HOSTNAME="booking.propus.ch"
ARG NEXT_PUBLIC_CUSTOMER_PORTAL_URL=""
ARG NEXT_PUBLIC_LOGTO_ADMIN_URL=""
ARG NEXT_PUBLIC_BASE_URL="/"
ARG PLATFORM_INTERNAL_URL=""

ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_PUBLIC_BOOKING_HOSTNAME=$NEXT_PUBLIC_PUBLIC_BOOKING_HOSTNAME
ENV NEXT_PUBLIC_CUSTOMER_PORTAL_URL=$NEXT_PUBLIC_CUSTOMER_PORTAL_URL
ENV NEXT_PUBLIC_LOGTO_ADMIN_URL=$NEXT_PUBLIC_LOGTO_ADMIN_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV PLATFORM_INTERNAL_URL=$PLATFORM_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20.18.1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat postgresql-client curl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 propus

# Create log directory
RUN mkdir -p /app/logs && chown -R propus:nodejs /app/logs

# ── Next.js Standalone ──
COPY --from=nextjs-builder --chown=propus:nodejs /nextjs/.next/standalone ./nextjs/
COPY --from=nextjs-builder --chown=propus:nodejs /nextjs/.next/static ./nextjs/.next/static
COPY --from=nextjs-builder --chown=propus:nodejs /nextjs/public ./nextjs/public

# ── Express Backend (Booking + Tours + Auth + Platform) ──
COPY booking/package*.json ./booking/
RUN cd booking && npm ci --omit=dev

COPY tours/package*.json ./tours/
RUN cd tours && npm ci --omit=dev

COPY auth/package*.json ./auth/
RUN cd auth && npm ci --omit=dev

COPY platform/package*.json ./platform/
RUN cd platform && npm ci --omit=dev

COPY booking ./booking
COPY booking/admin-panel/dist ./booking/admin-panel/dist
COPY tours ./tours
COPY auth ./auth
COPY core ./core
COPY infra ./infra
COPY platform ./platform
COPY scripts ./scripts

RUN chmod +x /app/scripts/*.sh 2>/dev/null || true

# ── Writable runtime data directories (owned by propus before USER switch) ──
RUN mkdir -p /app/booking/data/photographer-portraits && \
    chown -R propus:nodejs /app/booking/data

# ── Start-Script ──
COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh 2>/dev/null; true

USER propus

ENV NODE_ENV=production
ENV PORT=3100
ENV NEXTJS_PORT=3001
ENV ADMIN_PANEL_DIST=/app/booking/admin-panel/dist
ENV TOURS_MOUNT_PATH=/tour-manager
ENV PROPUS_ENABLE_LEGACY_CUSTOMER_LOGIN=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV LOG_DIR=/app/logs
ENV PLATFORM_INTERNAL_URL=http://localhost:3100

# 3001 = Next.js (external entrypoint), 3100 = Express (internal only)
EXPOSE 3001 3100

CMD ["./start.sh"]
