FROM node:22-alpine

# Einige native Module (u. a. Abhaengigkeiten) erwarten glibc-Kompatibilitaet unter musl
RUN apk add --no-cache libc6-compat

# Build-Context ist Repo-Root, damit wir sowohl booking/ als auch core/
# kopieren können — booking/db.js importiert core/lib/customer-lookup.js.
WORKDIR /app

COPY booking/package.json booking/package-lock.json ./booking/
RUN cd booking && npm ci --omit=dev

COPY booking ./booking
COPY core ./core
# OpenAPI-Spec wird zur Laufzeit von booking/docs-routes.js (/api/docs) gelesen.
COPY docs/openapi ./docs/openapi

# Non-root user (Bug-Hunt T12 HIGH). Container darf bei Compromise nicht
# als root am Mount-Volume schreiben oder /etc anpassen.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 booking \
    && chown -R booking:nodejs /app

WORKDIR /app/booking

USER booking

EXPOSE 3000

CMD ["npm", "start"]
