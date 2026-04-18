# Next.js Standalone Build
# Multi-stage: Build -> Runtime

FROM node:20.18.1-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY app/package*.json ./
RUN npm ci

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/ .

# Build args for public env vars
ARG NEXT_PUBLIC_API_BASE=""
ARG NEXT_PUBLIC_PUBLIC_BOOKING_HOSTNAME="booking.propus.ch"
ARG NEXT_PUBLIC_CUSTOMER_PORTAL_URL=""
ARG NEXT_PUBLIC_BASE_URL="/"

ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_PUBLIC_BOOKING_HOSTNAME=$NEXT_PUBLIC_PUBLIC_BOOKING_HOSTNAME
ENV NEXT_PUBLIC_CUSTOMER_PORTAL_URL=$NEXT_PUBLIC_CUSTOMER_PORTAL_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM node:20.18.1-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat postgresql-client
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create log directory
RUN mkdir -p /app/logs && chown -R nextjs:nodejs /app/logs

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV LOG_DIR=/app/logs
ENV LOG_FILE_ENABLED=true

EXPOSE 3000

CMD ["node", "server.js"]
