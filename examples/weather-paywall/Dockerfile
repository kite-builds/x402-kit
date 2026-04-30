# Multi-stage Dockerfile for the x402-kit weather-paywall example.
# Build context = monorepo root, so workspace deps resolve cleanly.
#
# Build:
#   docker build -t x402-weather -f examples/weather-paywall/Dockerfile .
# Run (mainnet):
#   docker run -p 3402:3402 -e X402_KIT_CONFIG=x402-kit.mainnet.yaml -v x402data:/data x402-weather

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/dashboard-ui/package.json packages/dashboard-ui/
COPY packages/cli/package.json packages/cli/
COPY examples/weather-paywall/package.json examples/weather-paywall/
RUN npm ci --workspaces --include-workspace-root

COPY packages packages
COPY examples/weather-paywall examples/weather-paywall
RUN npm run build -w x402-kit
RUN npm run build -w x402-kit-example-weather-paywall

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3402
ENV X402_KIT_CONFIG=x402-kit.mainnet.yaml

COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/server/package.json packages/server/
COPY --from=build /repo/packages/server/dist packages/server/dist
COPY --from=build /repo/examples/weather-paywall/package.json examples/weather-paywall/
COPY --from=build /repo/examples/weather-paywall/dist examples/weather-paywall/dist
COPY --from=build /repo/examples/weather-paywall/x402-kit.yaml examples/weather-paywall/
COPY --from=build /repo/examples/weather-paywall/x402-kit.mainnet.yaml examples/weather-paywall/

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && mkdir -p /data \
    && chown -R node:node /app /data

USER node
WORKDIR /app/examples/weather-paywall
VOLUME ["/data"]
EXPOSE 3402
CMD ["node", "dist/server.js"]
