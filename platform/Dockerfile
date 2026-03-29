# Multi-Stage: React-Frontend bauen, dann Node-Runtime mit Booking + Tours
FROM node:20-alpine AS frontend
WORKDIR /src
COPY platform/frontend/package*.json ./
RUN npm ci
COPY platform/frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY booking/package*.json ./booking/
RUN cd booking && npm ci --omit=dev

COPY tours/package*.json ./tours/
RUN cd tours && npm ci --omit=dev

COPY platform/package*.json ./platform/
RUN cd platform && npm ci --omit=dev

COPY booking ./booking
COPY tours ./tours
COPY auth ./auth
COPY platform ./platform

RUN ln -s /app/platform/node_modules /app/auth/node_modules

COPY --from=frontend /src/dist ./platform/frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV ADMIN_PANEL_DIST=/app/platform/frontend/dist
ENV TOURS_MOUNT_PATH=/tour-manager
ENV PROPUS_ENABLE_LEGACY_CUSTOMER_LOGIN=0

EXPOSE 3000

CMD ["node", "/app/platform/server.js"]
