# Prometheus with the EventTix configuration and alert rules baked in (infrastructure as code).
FROM prom/prometheus:v3.14.0

COPY prometheus.yml alerts.yml alerts.test.yml /etc/prometheus/
