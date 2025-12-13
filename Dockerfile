# ---------- Builder Stage ----------
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy lockfile + package.json
COPY package.json bun.lock ./

# Install ALL deps (including dev for type checking if needed)
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Optional: Build if you have a build step
# RUN bun run build

# ---------- Production Stage ----------
FROM oven/bun:1-alpine AS production
WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/data ./data  # if you want persistent data (better with volume)

# Install only production deps
RUN bun install --frozen-lockfile --production

# Create data dir
RUN mkdir -p /app/data

EXPOSE 3000

# Load .env if exists, then run server
CMD ["bun", "run", "start"]
