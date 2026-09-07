# Base stage with mirror and pnpm pre-installed
FROM node:22-alpine AS base
WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories 2>/dev/null || true
RUN npm install -g pnpm --registry=https://registry.npmmirror.com
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Stage 1: Dependencies & native module compilation
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++

COPY .npmrc package.json pnpm-lock.yaml* ./
RUN pnpm config set registry https://registry.npmmirror.com && \
    (pnpm approve-builds --all 2>/dev/null || true) && \
    (pnpm install --frozen-lockfile || pnpm install)

# Stage 2: Application Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8766
ENV HOSTNAME="0.0.0.0"

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories 2>/dev/null || true
RUN apk add --no-cache libc6-compat libstdc++

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public static files
COPY --from=builder /app/public ./public

# Setup data directory permissions for SQLite persistence
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy Next.js standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Ensure better-sqlite3 native bindings from deps are available
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

USER nextjs

EXPOSE 8766

VOLUME ["/app/data"]

CMD ["node", "server.js"]
