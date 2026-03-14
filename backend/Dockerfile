FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies (dev deps required for TypeScript build stage)
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript to dist/
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install curl for healthcheck and create non-root runtime user
RUN apk add --no-cache curl \
	&& addgroup -S nodejs \
	&& adduser -S expressjs -G nodejs

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist

USER expressjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD curl -fsS http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server.js"]




