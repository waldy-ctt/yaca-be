FROM oven/bun:1-alpine AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
EXPOSE 3000
RUN mkdir -p /app/data
CMD ["bun", "run", "src/index.ts"]
