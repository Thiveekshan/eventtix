# Alertmanager with the EventTix routing rules baked in (infrastructure as code).
FROM prom/alertmanager:v0.34.1

COPY alertmanager.base.yml discord.part.yml entrypoint.sh /etc/alertmanager/

# The base image already runs as this unprivileged user; stating it makes that explicit and checkable.
USER nobody

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=12 \
  CMD wget -q -O /dev/null http://127.0.0.1:9093/-/ready || exit 1

ENTRYPOINT ["/bin/sh", "/etc/alertmanager/entrypoint.sh"]
