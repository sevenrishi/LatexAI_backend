# Multi-stage production Dockerfile for LatexAI Backend API

# 1. Base Stage
FROM node:22-alpine AS base
WORKDIR /app

# 2. Dependencies Stage
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

# 3. Build Stage
FROM dependencies AS builder
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build
# Prune development dependencies
RUN npm prune --omit=dev

# 4. Production Runner Stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Run container as non-root user for security
USER node

# Copy production artifacts
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 4000

# Healthcheck for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
