# Polis — single-container production image.
# Serves the operations console UI, REST API and Colyseus WebSocket on :3000.
FROM node:24-slim

WORKDIR /app

# Install deps from the lockfile (workspaces: packages/*, examples/*)
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY examples ./examples
RUN npm ci

# Build every workspace (server tsc + ui vite)
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# SQLite memory lives in ./data inside the container (mount a volume to persist)
CMD ["node", "packages/server/dist/index.js"]
