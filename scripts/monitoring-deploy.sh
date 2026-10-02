#!/bin/sh
# Deploys the monitoring stack (Prometheus, Alertmanager, Grafana), tests it, and proves that it is
# really watching the production application and can reach the team.
#
# Run with:  sh scripts/monitoring-deploy.sh
#
# Needs these environment variables (the Jenkins pipeline sets them):
#   IMAGE_TAG     version to label the monitoring images with, e.g. 1.0.0.9
#   SECRETS_FILE  path to the monitoring secret file (Jenkins "secret file" credential)
#
# Steps:
#   1. Build the three images (their configuration is baked in).
#   2. Test the configuration: Prometheus config, alert rules, alert rule unit tests, Alertmanager config.
#   3. Start the stack and wait until every container is healthy.
#   4. Verify it end to end: production is being scraped, all rules are loaded, Prometheus can reach
#      Alertmanager, Grafana has its data sources and dashboard.
#   5. Send a "monitoring deployed" notification through Alertmanager to the team.
set -eu

TAG="${IMAGE_TAG:?IMAGE_TAG is not set}"
SECRETS_SOURCE="${SECRETS_FILE:?SECRETS_FILE is not set (the Jenkins secret file for monitoring)}"
BUILD="${BUILD_NUMBER:-unknown}"

PROJECT="eventtix-monitoring"
COMPOSE_FILE="monitoring/docker-compose.yml"
PRODUCTION_NETWORK="eventtix-production_default"
WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-240}"
VERIFY_SECONDS="${VERIFY_SECONDS:-90}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

step() {
  echo
  echo "== $*"
}

[ -f "$COMPOSE_FILE" ] || fail "missing $COMPOSE_FILE"
[ -f "$SECRETS_SOURCE" ] || fail "the secret file $SECRETS_SOURCE does not exist"

# A private copy of the secrets with Windows line endings removed.
SECRETS=$(mktemp)
trap 'rm -f "$SECRETS"' EXIT
tr -d '\r' < "$SECRETS_SOURCE" > "$SECRETS"

password=$(sed -n 's/^GRAFANA_ADMIN_PASSWORD=//p' "$SECRETS" | tail -n 1)
[ -n "$password" ] || fail "GRAFANA_ADMIN_PASSWORD is missing from the monitoring secret file"
case "$password" in
  CHANGE-ME*) fail "GRAFANA_ADMIN_PASSWORD is still the CHANGE-ME placeholder" ;;
esac
webhook=$(sed -n 's/^DISCORD_WEBHOOK_URL=//p' "$SECRETS" | tail -n 1)
if [ -n "$webhook" ]; then
  case "$webhook" in
    https://*) ;;
    *) fail "DISCORD_WEBHOOK_URL must start with https:// (or leave it empty)" ;;
  esac
  NOTIFY="Discord and the web interfaces"
else
  NOTIFY="the web interfaces only (no Discord webhook was configured)"
fi

IMAGE_TAG="$TAG"
export IMAGE_TAG

compose() {
  docker compose -p "$PROJECT" --env-file "$SECRETS" -f "$COMPOSE_FILE" "$@"
}

# Runs a command inside one of the monitoring containers.
inside() {
  service="$1"
  shift
  container=$(compose ps -q "$service")
  [ -n "$container" ] || fail "the $service container is not running"
  docker exec "$container" "$@"
}

# Asks a monitoring service's web API a question (from inside its own container).
ask() {
  service="$1"
  url="$2"
  inside "$service" wget -q -O - "$url"
}

# Repeats a check until it passes or time runs out.  usage: wait_for "what" check_command [args...]
wait_for() {
  what="$1"
  shift
  waited=0
  until "$@" >/dev/null 2>&1; do
    waited=$((waited + 3))
    if [ "$waited" -ge "$VERIFY_SECONDS" ]; then
      fail "timed out after ${VERIFY_SECONDS}s waiting for: $what"
    fi
    sleep 3
  done
  echo "   ok: $what"
}

prometheus_scrapes_production() {
  ask prometheus 'http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22eventtix-api%22%7D' |
    grep -q '"value":\[[0-9.]*,"1"\]'
}

prometheus_sees_alertmanager() {
  ask prometheus 'http://127.0.0.1:9090/api/v1/alertmanagers' | grep -q '"activeAlertmanagers":\[{'
}

all_rules_loaded() {
  expected=$(grep -c '^      - alert:' monitoring/prometheus/alerts.yml)
  loaded=$(ask prometheus 'http://127.0.0.1:9090/api/v1/rules' | grep -o '"name":"EventTix[A-Za-z]*"' | sort -u | wc -l)
  echo "   ($loaded of $expected alert rules loaded)" >&2
  [ "$loaded" -ge "$expected" ]
}

# Grafana is asked from inside its own container, so the admin password never leaves it.
grafana_has() {
  query="$1"
  expected_text="$2"
  inside grafana sh -c "wget -q -O - --header \"Authorization: Basic \$(printf 'admin:%s' \"\$GF_SECURITY_ADMIN_PASSWORD\" | base64)\" 'http://127.0.0.1:3000/api/$query'" |
    grep -q "$expected_text"
}

# ---------------------------------------------------------------------------
step "1/5  Checking production is running (monitoring joins its network)"
docker network inspect "$PRODUCTION_NETWORK" >/dev/null 2>&1 ||
  fail "the production network $PRODUCTION_NETWORK does not exist. Production must be deployed first (Release stage)."
echo "   production network found"

step "2/5  Building the monitoring images (version $TAG)"
compose build

step "3/5  Testing the configuration before it is used"
echo "   Prometheus configuration"
docker run --rm --entrypoint promtool "eventtix-prometheus:$TAG" check config /etc/prometheus/prometheus.yml
echo "   Alert rules"
docker run --rm --entrypoint promtool "eventtix-prometheus:$TAG" check rules /etc/prometheus/alerts.yml
echo "   Alert rule unit tests (do the alerts fire when they should, and stay quiet when they should?)"
docker run --rm --entrypoint promtool "eventtix-prometheus:$TAG" test rules /etc/prometheus/alerts.test.yml
echo "   Alertmanager configuration, with and without a Discord channel"
docker run --rm --entrypoint sh "eventtix-alertmanager:$TAG" -c \
  'RENDER_ONLY=1 sh /etc/alertmanager/entrypoint.sh && amtool check-config /tmp/alertmanager.yml'
docker run --rm -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/0/check --entrypoint sh "eventtix-alertmanager:$TAG" -c \
  'RENDER_ONLY=1 sh /etc/alertmanager/entrypoint.sh && amtool check-config /tmp/alertmanager.yml'

step "4/5  Starting the monitoring stack"
compose up -d --remove-orphans --wait --wait-timeout "$WAIT_SECONDS"

step "5/5  Verifying that it really works"
wait_for "Prometheus is scraping the production API" prometheus_scrapes_production
wait_for "Prometheus is connected to Alertmanager" prometheus_sees_alertmanager
wait_for "all alert rules are loaded" all_rules_loaded
wait_for "Grafana has the Prometheus data source" grafana_has 'datasources' '"name":"Prometheus"'
wait_for "Grafana has the EventTix Production dashboard" grafana_has 'search?query=EventTix' '"title":"EventTix Production"'

# Tell the team, which also proves the whole alert path (Alertmanager to Discord) works on every release.
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ended=$(date -u -d '+2 minutes' +%Y-%m-%dT%H:%M:%SZ)
notification=$(printf '[{"labels":{"alertname":"EventTixMonitoringDeployed","severity":"info","environment":"production"},"annotations":{"summary":"EventTix %s is released and monitored","description":"Jenkins build #%s deployed version %s to production. Monitoring is live: %s."},"startsAt":"%s","endsAt":"%s"}]' \
  "$TAG" "$BUILD" "$TAG" "$NOTIFY" "$started" "$ended")
inside alertmanager wget -q -O - --header 'Content-Type: application/json' --post-data "$notification" \
  http://127.0.0.1:9093/api/v2/alerts >/dev/null
alert_arrived() {
  ask alertmanager 'http://127.0.0.1:9093/api/v2/alerts' | grep -q 'EventTixMonitoringDeployed'
}
wait_for "the deployment notification reached Alertmanager (sent to $NOTIFY)" alert_arrived

echo
echo "MONITORING IS LIVE (version $TAG)"
echo "   Dashboard     http://localhost:3030   (user: admin)"
echo "   Alert rules   http://localhost:9090/alerts"
echo "   Alertmanager  http://localhost:9093"
echo "   Notifications: $NOTIFY"
