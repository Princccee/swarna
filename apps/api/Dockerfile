# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

RUN npm ci --workspace=apps/api --workspace=packages/shared-types --include-workspace-root

# Copy source
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Pre-compile shared-types so API build uses .d.ts (not .ts source),
# keeping rootDir clean for the API build
WORKDIR /app/packages/shared-types
RUN npx tsc

# Generate Prisma client and build API
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx nest build --tsc

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

RUN npm ci --workspace=apps/api --workspace=packages/shared-types --include-workspace-root --omit=dev

# Copy compiled shared-types (needed for runtime JS imports)
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

# Copy API build output, prisma schema, and generated Prisma client
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/main"]
