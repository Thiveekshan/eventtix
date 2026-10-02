#!/bin/sh
# Quality gate as code: makes sure the SonarQube project and its quality gate exist,
# with exactly the thresholds below. Safe to run on every build (it recreates the gate).
#
# Run with:  sh scripts/sonar-setup.sh     (needs SONAR_HOST_URL and SONAR_TOKEN)
set -eu
. "$(dirname "$0")/sonar-common.sh"

PROJECT_KEY="${SONAR_PROJECT_KEY:-eventtix}"
PROJECT_NAME="${SONAR_PROJECT_NAME:-EventTix}"
GATE_NAME="${SONAR_GATE_NAME:-EventTix Gate}"

wait_for_sonarqube

# 1. The project
found=$(call GET /api/projects/search -G --data-urlencode "projects=$PROJECT_KEY" | json 'o.paging.total')
if [ "${found:-0}" = "0" ]; then
  call POST /api/projects/create \
    --data-urlencode "name=$PROJECT_NAME" --data-urlencode "project=$PROJECT_KEY" >/dev/null
  echo "Created SonarQube project '$PROJECT_KEY'"
else
  echo "SonarQube project '$PROJECT_KEY' already exists"
fi

# 2. The quality gate: delete the old one (if any) and create it again from the list below.
code=$(curl -s -o /dev/null -w '%{http_code}' -u "$SONAR_TOKEN:" -G \
  --data-urlencode "name=$GATE_NAME" "$SONAR_HOST_URL/api/qualitygates/show")
if [ "$code" = "200" ]; then
  call POST /api/qualitygates/destroy --data-urlencode "name=$GATE_NAME" >/dev/null
fi
call POST /api/qualitygates/create --data-urlencode "name=$GATE_NAME" >/dev/null

# SonarQube pre-fills every new gate with its default "new code" conditions.
# Remove them, so that only the conditions listed below apply.
default_ids=$(call GET /api/qualitygates/show -G --data-urlencode "name=$GATE_NAME" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  for (const c of JSON.parse(s).conditions||[]) console.log(c.id);
})")
for condition_id in $default_ids; do
  call POST /api/qualitygates/delete_condition --data-urlencode "id=$condition_id" >/dev/null
done

# Each line is:  metric | operator | threshold.  The gate FAILS when the condition is true.
#   LT = fails if the value is Less Than the threshold     (e.g. coverage under 80%)
#   GT = fails if the value is Greater Than the threshold  (e.g. duplication over 3%)
# Ratings: 1 = A (best), 2 = B, 3 = C, 4 = D, 5 = E.
while IFS='|' read -r metric op threshold; do
  [ -n "$metric" ] || continue
  call POST /api/qualitygates/create_condition \
    --data-urlencode "gateName=$GATE_NAME" \
    --data-urlencode "metric=$metric" \
    --data-urlencode "op=$op" \
    --data-urlencode "error=$threshold" >/dev/null
done <<'CONDITIONS'
coverage|LT|80
duplicated_lines_density|GT|3
reliability_rating|GT|1
security_rating|GT|1
sqale_rating|GT|1
security_hotspots_reviewed|LT|100
CONDITIONS

# 3. Use this gate for the project.
call POST /api/qualitygates/select \
  --data-urlencode "gateName=$GATE_NAME" --data-urlencode "projectKey=$PROJECT_KEY" >/dev/null

echo
echo "Quality gate '$GATE_NAME' is active for '$PROJECT_KEY'. The build fails unless:"
call GET /api/qualitygates/show -G --data-urlencode "name=$GATE_NAME" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const labels={coverage:'test coverage (%)',duplicated_lines_density:'duplicated lines (%)',
    reliability_rating:'reliability rating (1=A)',security_rating:'security rating (1=A)',
    sqale_rating:'maintainability rating (1=A)',security_hotspots_reviewed:'security hotspots reviewed (%)'};
  for (const c of JSON.parse(s).conditions||[]) {
    console.log('  - '+(labels[c.metric]||c.metric)+' is '+(c.op==='LT'?'at least ':'at most ')+c.error);
  }
})"
