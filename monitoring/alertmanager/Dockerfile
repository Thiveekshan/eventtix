# Alertmanager with the EventTix routing rules baked in (infrastructure as code).
FROM prom/alertmanager:v0.34.1

COPY alertmanager.base.yml discord.part.yml entrypoint.sh /etc/alertmanager/

ENTRYPOINT ["/bin/sh", "/etc/alertmanager/entrypoint.sh"]
