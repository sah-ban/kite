FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    KITE_HOST=0.0.0.0 \
    PORT=3000 \
    KITE_SESSION_DIR=/data/sessions

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./*.mjs ./
COPY --chown=node:node feed ./feed
COPY --chown=node:node data ./data

RUN mkdir -p /data/sessions \
    && chown -R node:node /data \
    && chmod 700 /data/sessions

USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
