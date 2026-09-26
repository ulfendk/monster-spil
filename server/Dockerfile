# The whole game: the server, and the built game it serves at the same address.
# Build from the repo root so the npm workspaces resolve:
#   docker build -f server/Dockerfile -t monsterjagt-server .
# (server/docker-compose.yml does this for you.)

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include-workspace-root --workspace shared --workspace server --workspace client
COPY shared shared
COPY server server
COPY client client
RUN npx tsc -b shared server
# The game itself, served by this server at its own address: VITE_SERVER_URL=/ means
# "the server this page came from", VITE_BASE=/ puts it at the root.
RUN VITE_BASE=/ VITE_SERVER_URL=/ npm run build -w client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace shared --workspace server
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
# Read at runtime: boss definitions, and the maps (to know where food can grow).
COPY shared/content/raid shared/content/raid
COPY shared/content/beasts shared/content/beasts
COPY shared/content/areas shared/content/areas
COPY shared/content/disasters.json shared/content/disasters.json
COPY shared/content/caves.json shared/content/caves.json
# Scores, the dragon's HP and unclaimed rewards live here; mount a volume on /data to keep them.
RUN mkdir -p /data && chown node:node /data
ENV DATA_DIR=/data
VOLUME /data
USER node
ENV PORT=2567
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
