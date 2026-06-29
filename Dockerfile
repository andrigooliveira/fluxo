# ────────────────────────────────────────────────────────────────
# Kastor — Imagem Docker
#
# Base: Node 22 alpine (precisa de 22.5+ porque o backend usa o módulo
# built-in `node:sqlite`, que só existe a partir do Node 22.5).
# Alpine deixa a imagem em ~80MB.
#
# Build:   docker build -t kastor .
# Run:     docker run -p 3000:3000 -v kastor_data:/app/data kastor
# ────────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Instala dependências primeiro (cache de layer eficiente — só re-instala
# se package.json mudou, não a cada mudança em código fonte).
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copia o restante do código. .dockerignore garante que data/, node_modules,
# .env, .git e demais arquivos sensíveis ou pesados fiquem de fora.
COPY . .

# Diretório persistente onde ficam: kastor.db (SQLite), uploads/, secret.bin.
# Tem que estar montado como volume — sem volume, os dados somem a cada
# restart do container.
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV KASTOR_DATA_DIR=/app/data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck: GET / devolve o HTML do SPA. Se voltar 200, app está vivo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/ > /dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
