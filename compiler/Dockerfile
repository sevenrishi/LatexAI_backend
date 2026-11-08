# Multi-stage Dockerfile for LaTeX Compiler Microservice
# Complies with task BE-3.20

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install minimal required TeX Live distribution and utility packages
RUN apt-get update && apt-get install -y --no-install-recommends \
  texlive-latex-base \
  texlive-latex-recommended \
  texlive-latex-extra \
  texlive-fonts-recommended \
  cm-super \
  ghostscript \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy paranoid texmf configuration to prevent shell escape and file access
COPY texmf.cnf /usr/share/texmf/web2c/texmf.cnf
ENV TEXMFCNF=/usr/share/texmf/web2c/

# Non-root user for sandboxed security
RUN groupadd -g 1001 latexapp && useradd -u 1001 -g latexapp -m latexapp

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY --from=builder /app/dist ./dist

RUN chown -R latexapp:latexapp /app
USER latexapp

ENV NODE_ENV=production
ENV PORT=5050

EXPOSE 5050

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:5050/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
