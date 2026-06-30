# Installs dependencies and copies source; shared by every stage below.
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# CI stage: typecheck, lint, test, build in one reproducible container.
FROM base AS ci
CMD ["sh", "-c", "npm run typecheck && npm run lint && npm test && npm run build"]

# Produces the production server bundle (Nitro "node-server" preset).
# VITE_CONVEX_URL is inlined into the client bundle at build time by Vite, so
# it must be passed as a build arg here -- setting it on the runtime
# container later has no effect.
FROM base AS build
ARG VITE_CONVEX_URL
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output/server ./server
COPY --from=build /app/.output/public ./public
EXPOSE 3000
CMD ["node", "server/index.mjs"]
