# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

# install dependencies first
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# rebuild native addons
RUN apk add --no-cache python3 make g++ && npm rebuild better-sqlite3

# prisma client generation
RUN npx prisma generate 

# build next
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# non-root user
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# copy only what we need at runtime
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/env.js ./src/env.js

# entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# sqlite location
ENV DATABASE_URL="file:/data/dev.db"

# where sqlite will live
RUN mkdir -p /data && chown -R nextjs:nodejs /data
USER nextjs

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
