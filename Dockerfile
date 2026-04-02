FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3, bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install

# Build shared
COPY packages/shared/ packages/shared/
COPY tsconfig.base.json ./
RUN npm run build -w packages/shared

# Build client
COPY packages/client/ packages/client/
RUN npm run build -w packages/client

# Build server
COPY packages/server/ packages/server/
RUN npm run build -w packages/server

# --- Production image ---
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ unzip curl && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz | tar xz --strip-components=1 -C /usr/local/bin docker/docker

COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install --omit=dev

# Copy built output
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/client/dist packages/client/dist
COPY --from=builder /app/tsconfig.base.json ./

# Copy SQL migrations (not included in tsc output)
COPY packages/server/src/db/migrations/ packages/server/dist/db/migrations/

# Copy templates
COPY templates/ templates/

EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV TEMPLATES_DIR=/app/templates

CMD ["node", "packages/server/dist/index.js"]
