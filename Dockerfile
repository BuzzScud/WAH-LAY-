# Multistage build for the Astro Node adapter. Build this OFF the droplet
# (locally or in GitHub Actions) and have the droplet pull the image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Run as non-root (droplet hardening checklist)
RUN addgroup -S app && adduser -S app -G app
# Production deps only — drizzle-orm + postgres are enough to run migrations
# (scripts/migrate.mjs uses the drizzle-orm migrator, not drizzle-kit).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["sh", "-c", "node ./scripts/migrate.mjs && exec node ./dist/server/entry.mjs"]
