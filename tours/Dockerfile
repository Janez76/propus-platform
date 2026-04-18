FROM node:20.18.1-slim

WORKDIR /app
COPY tours/package.json ./package.json
RUN npm install --production

COPY tours ./tours
COPY auth ./auth

WORKDIR /app/tours
EXPOSE 3000
CMD ["node", "server.js"]
