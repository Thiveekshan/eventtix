# ---- Stage 1: build the static site ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# "/api" is a relative address: nginx forwards it to the backend, so the same
# image works unchanged in staging and production.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Stage 2: serve it with nginx (runs as a non-root user, listens on 8080) ----
FROM nginxinc/nginx-unprivileged:1.28-alpine

ARG APP_VERSION=1.0.0
LABEL org.opencontainers.image.title="eventtix-frontend" \
      org.opencontainers.image.version=$APP_VERSION

# Where /api requests are forwarded. Override per environment if needed.
ENV BACKEND_URL=http://backend:3000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# The base image already runs as this unprivileged user; stating it makes that explicit and checkable.
USER nginx

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
