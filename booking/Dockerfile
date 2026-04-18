FROM node:20.18.1-alpine

# Einige native Module (u. a. Abhaengigkeiten) erwarten glibc-Kompatibilitaet unter musl
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
