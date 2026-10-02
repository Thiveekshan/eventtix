# Prometheus with the EventTix configuration and alert rules baked in (infrastructure as code).
FROM prom/prometheus:v3.14.0

COPY prometheus.yml alerts.yml alerts.test.yml /etc/prometheus/

# The base image already runs as this unprivileged user; stating it makes that explicit and checkable.
USER nobody

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=12 \
  CMD wget -q -O /dev/null http://127.0.0.1:9090/-/ready || exit 1
