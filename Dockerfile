FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
# git: the `bosun-x` devDependency is a pinned github: URL until it's on npm. The
# lockfile resolves it over ssh (the host has keys); rewrite to https here so the
# build fetches the public repo without any credentials.
RUN apk add --no-cache git \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
RUN apk add --no-cache docker-cli git curl openssh-client tzdata
# Mounted project repos are host-owned (a different uid than the container user) —
# without this, git's ownership check refuses to read them at all.
RUN git config --system --add safe.directory '*'
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
# node:alpine's built-in uid 1000 ("node") has home /home/node. If your compose runs
# the container as uid 1000 (e.g. to read discovery SSH keys owned by that uid on the
# host) and your mounted ssh config uses `~/...` paths, OpenSSH resolves `~` via this
# passwd entry, not $HOME — so point it at that user's real home. Default is a no-op.
ARG DISCOVERY_HOME=/home/node
RUN sed -i "s|^node:x:1000:1000::/home/node:|node:x:1000:1000::${DISCOVERY_HOME}:|" /etc/passwd
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3010
ENV PORT=3010
# Without this, the standalone server resolves $HOSTNAME (Docker sets it to the
# container ID) and binds only to that container's own network IP, not 0.0.0.0 —
# so even the in-container healthcheck against localhost fails to connect.
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3010/api/health || exit 1
CMD ["node", "server.js"]
