#!/bin/sh
# Deploys the images that were just built to one environment, tests them, and rolls back if the test fails.
#
# Run with:  sh scripts/deploy.sh staging
#
# Needs these environment variables (the Jenkins pipeline sets them):
#   IMAGE_TAG     version to deploy, e.g. 1.0.0.7  (the last number is the Jenkins build number)
#   SECRETS_FILE  path to this environment's secret file (Jenkins "secret file" credential)
#
# Steps:
#   1. Remember which version is running now (so it can be restored).
#   2. Start the new version with Docker Compose and wait until every container is healthy.
#   3. Run the smoke test (scripts/smoke-test.js) against the new version.
#   4. If anything fails: redeploy the previous version, test that, and fail the build.
set -eu

ENVIRONMENT="${1:?usage: sh scripts/deploy.sh staging|production}"
TAG="${IMAGE_TAG:?IMAGE_TAG is not set}"
SECRETS_SOURCE="${SECRETS_FILE:?SECRETS_FILE is not set (the Jenkins secret file for this environment)}"

CONFIG="deploy/$ENVIRONMENT.env"
COMPOSE_FILE="deploy/docker-compose.yml"
PROJECT="eventtix-$ENVIRONMENT"
WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-180}"

# Demo only: set SIMULATE_BAD_RELEASE=true to start the NEW version with a missing secret, so it genuinely
# fails to start and the automatic rollback has to bring the previous version back. Staging only.
SIMULATE_BAD_RELEASE="${SIMULATE_BAD_RELEASE:-false}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ -f "$CONFIG" ] || fail "missing $CONFIG"
[ -f "$COMPOSE_FILE" ] || fail "missing $COMPOSE_FILE"
[ -f "$SECRETS_SOURCE" ] || fail "the secret file $SECRETS_SOURCE does not exist"

# A private copy of the secrets with Windows line endings removed (files made in Notepad have them).
SECRETS=$(mktemp)
FAULT_FILE=""
trap 'rm -f "$SECRETS" "$FAULT_FILE"' EXIT
tr -d '\r' < "$SECRETS_SOURCE" > "$SECRETS"

if [ "$SIMULATE_BAD_RELEASE" = "true" ]; then
  [ "$ENVIRONMENT" = "staging" ] || fail "a bad release is only ever simulated in staging, never in $ENVIRONMENT"
  FAULT_FILE=$(mktemp)
  cat > "$FAULT_FILE" <<'FAULT'
services:
  backend:
    environment:
      JWT_SECRET: ""
FAULT
  WAIT_SECONDS=75
  echo "!! SIMULATION: the new version will start with its JWT secret missing, so it cannot boot."
  echo "!! This is a staging-only demo of the automatic rollback."
fi

# Stop early, with a clear message, if a secret is missing or still a placeholder.
for name in POSTGRES_PASSWORD JWT_SECRET ADMIN_EMAIL ADMIN_PASSWORD; do
  value=$(sed -n "s/^$name=//p" "$SECRETS" | tail -n 1)
  [ -n "$value" ] || fail "$name is missing from the $ENVIRONMENT secret file"
  case "$value" in
    CHANGE-ME*) fail "$name in the $ENVIRONMENT secret file is still the CHANGE-ME placeholder" ;;
  esac
done

SMOKE_MODE=$(sed -n 's/^SMOKE_MODE=//p' "$CONFIG" | tail -n 1)
SMOKE_MODE="${SMOKE_MODE:-full}"

# docker compose with this environment's settings. Secrets come from the file, never from the command line.
compose() {
  if [ -n "$FAULT_FILE" ]; then
    docker compose -p "$PROJECT" --env-file "$CONFIG" --env-file "$SECRETS" -f "$COMPOSE_FILE" -f "$FAULT_FILE" "$@"
  else
    docker compose -p "$PROJECT" --env-file "$CONFIG" --env-file "$SECRETS" -f "$COMPOSE_FILE" "$@"
  fi
}

# The version currently running in this environment (empty on the very first deploy).
previous_tag() {
  cid=$(compose ps -q backend 2>/dev/null | head -n 1 || true)
  if [ -n "$cid" ]; then
    docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null | sed 's/^.*://' || true
  fi
}

# Starts a version and waits until all containers are healthy.
start_version() {
  IMAGE_TAG="$1"
  export IMAGE_TAG
  compose up -d --remove-orphans --wait --wait-timeout "$WAIT_SECONDS"
}

# Runs the smoke test inside the backend container of this environment.
# The build number is the last part of the version (1.0.0.7 -> 7).
smoke_test() {
  version="$1"
  expected_build="${version##*.}"
  backend=$(compose ps -q backend)
  attempt=1
  while :; do
    if docker exec -i \
      -e EXPECTED_BUILD="$expected_build" \
      -e EXPECTED_ENV="$ENVIRONMENT" \
      -e SMOKE_MODE="$SMOKE_MODE" \
      "$backend" node - < scripts/smoke-test.js; then
      return 0
    fi
    # Give a slow start a few more chances before calling it a failure.
    [ "$attempt" -lt 3 ] || return 1
    attempt=$((attempt + 1))
    echo "Smoke test failed; trying again in 5 seconds (attempt $attempt of 3)..."
    sleep 5
  done
}

PREVIOUS=$(previous_tag)
echo "== Deploying version $TAG to $ENVIRONMENT"
echo "   currently running: ${PREVIOUS:-nothing (first deployment)}"

if start_version "$TAG" && smoke_test "$TAG"; then
  echo
  compose ps
  echo
  echo "DEPLOYED: version $TAG is running in $ENVIRONMENT and passed the smoke test"
  exit 0
fi

echo
echo "DEPLOYMENT FAILED for version $TAG. Recent container logs:" >&2
compose logs --tail 30 backend frontend >&2 || true

if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$TAG" ]; then
  echo
  echo "== ROLLING BACK to version $PREVIOUS"
  FAULT_FILE=""     # the previous version starts normally, without the simulated fault
  if start_version "$PREVIOUS" && smoke_test "$PREVIOUS"; then
    echo "ROLLED BACK: $ENVIRONMENT is running version $PREVIOUS again and is healthy" >&2
  else
    echo "ROLLBACK ALSO FAILED: $ENVIRONMENT needs attention" >&2
  fi
else
  echo "There is no earlier version to roll back to." >&2
fi
exit 1
