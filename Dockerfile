# 构建 Next.js 前端产物。
FROM node:22-bookworm-slim AS web-build

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl ca-certificates unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN npm config set fund false && npm config set audit false && npm install --no-audit --no-fund --legacy-peer-deps
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN npx next build

# 运行镜像：Next.js standalone + SQLite。
FROM node:22-bookworm-slim

WORKDIR /app
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY --from=web-build /app/web/public /app/web/public
COPY --from=web-build /app/web/.next/standalone /app/web
COPY --from=web-build /app/web/.next/static /app/web/.next/static
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

EXPOSE 3000
CMD ["sh", "-c", "cd /app/web && PORT=3000 node server.js"]
