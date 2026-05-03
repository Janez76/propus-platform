FROM node:20.18.1-alpine

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

WORKDIR /app/booking

EXPOSE 3000

CMD ["npm", "start"]
