# use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
COPY prisma /temp/prod/prisma/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules

# Copy source code and config
COPY package.json tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma Client (Bun runtime)
RUN bunx --bun prisma generate

ENV NODE_ENV=production

# ffmpeg is required by MediaProcessorService for chat video processing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create uploads directory and set permissions
RUN mkdir -p /usr/src/app/uploads/profile-pictures && chown -R bun:bun /usr/src/app/uploads

# Use non-root user for security
USER bun

EXPOSE 3000

# Coolify uses the image HEALTHCHECK to gate deployments and mark the
# container healthy. All legacy containers listen on 3000.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "src/main.ts"]
