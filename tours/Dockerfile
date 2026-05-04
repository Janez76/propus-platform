FROM node:22-slim

WORKDIR /app
COPY tours/package.json ./package.json
RUN npm install --production

COPY tours ./tours
COPY auth ./auth

# Non-root user (Bug-Hunt T12 HIGH). Container darf bei Compromise nicht
# als root am Mount-Volume schreiben. Debian-Slim → groupadd/useradd.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --no-create-home tours \
    && chown -R tours:nodejs /app

WORKDIR /app/tours

USER tours

EXPOSE 3000
CMD ["node", "server.js"]
