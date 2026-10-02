# Grafana with the EventTix data sources and dashboard baked in (infrastructure as code).
FROM grafana/grafana:13.1.4

COPY provisioning /etc/grafana/provisioning
COPY dashboards /etc/grafana/dashboards

# The base image runs Grafana as this unprivileged user (id 472); stating it makes that explicit and checkable.
USER 472

HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=18 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
