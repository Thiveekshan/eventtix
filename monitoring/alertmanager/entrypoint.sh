#!/bin/sh
# Builds the Alertmanager configuration when the container starts, adding the Discord channel only if a
# webhook URL was provided. The URL is a secret, so it comes from the environment and never from Git.
#
# Set RENDER_ONLY=1 to just write /tmp/alertmanager.yml and stop (used by the pipeline to check the config).
set -eu

OUT=/tmp/alertmanager.yml
cat /etc/alertmanager/alertmanager.base.yml > "$OUT"

URL="${DISCORD_WEBHOOK_URL:-}"
if [ -n "$URL" ]; then
  case "$URL" in
    https://*) ;;
    *) echo "DISCORD_WEBHOOK_URL must start with https://" >&2; exit 1 ;;
  esac
  case "$URL" in
    *[!A-Za-z0-9:/._~?=%-]*) echo "DISCORD_WEBHOOK_URL contains unexpected characters" >&2; exit 1 ;;
  esac
  sed "s|__DISCORD_WEBHOOK_URL__|$URL|" /etc/alertmanager/discord.part.yml >> "$OUT"
  echo "Alertmanager: alerts will be sent to Discord"
else
  echo "Alertmanager: no Discord webhook configured, alerts are only shown in the web interfaces"
fi

[ "${RENDER_ONLY:-}" = "1" ] && exit 0

exec /bin/alertmanager \
  --config.file="$OUT" \
  --storage.path=/alertmanager \
  --web.external-url=http://localhost:9093 \
  "$@"
