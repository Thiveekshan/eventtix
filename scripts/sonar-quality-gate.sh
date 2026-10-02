#!/bin/sh
# Waits for SonarQube to finish processing the analysis, prints every quality gate
# condition with its actual value, and exits with an error if the gate failed.
#
# Run with:  sh scripts/sonar-quality-gate.sh     (after the scanner has run)
set -eu
. "$(dirname "$0")/sonar-common.sh"

REPORT="${SONAR_REPORT_FILE:-.scannerwork/report-task.txt}"
PROJECT_KEY="${SONAR_PROJECT_KEY:-eventtix}"
PUBLIC_URL="${SONAR_PUBLIC_URL:-$SONAR_HOST_URL}"

if [ ! -f "$REPORT" ]; then
  echo "Cannot find $REPORT. Did the scanner run?" >&2
  exit 1
fi
task_id=$(sed -n 's/^ceTaskId=//p' "$REPORT")

# 1. Wait until the server has processed the analysis.
echo "Waiting for SonarQube to process analysis task $task_id ..."
attempt=0
while :; do
  body=$(call GET /api/ce/task -G --data-urlencode "id=$task_id")
  status=$(printf '%s' "$body" | json 'o.task.status')
  case $status in
    SUCCESS) break ;;
    FAILED | CANCELED)
      echo "SonarQube analysis $status" >&2
      exit 1
      ;;
  esac
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "${SONAR_TASK_ATTEMPTS:-60}" ]; then
    echo "Timed out waiting for the analysis to finish" >&2
    exit 1
  fi
  sleep "${SONAR_TASK_SECONDS:-3}"
done
analysis_id=$(printf '%s' "$body" | json 'o.task.analysisId')

# 2. Read the quality gate result.
gate=$(call GET /api/qualitygates/project_status -G --data-urlencode "analysisId=$analysis_id")
result=$(printf '%s' "$gate" | json 'o.projectStatus.status')

echo
echo "Quality gate conditions:"
printf '%s' "$gate" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const conditions=JSON.parse(s).projectStatus.conditions||[];
  for (const c of conditions) {
    const limit=(c.comparator==='LT'?'at least ':'at most ')+c.errorThreshold;
    console.log('  '+(c.status==='OK'?'PASS':'FAIL')+'  '+String(c.metricKey).padEnd(28)+' actual '+String(c.actualValue).padStart(6)+'   required: '+limit);
  }
})"

echo
echo "Dashboard: $PUBLIC_URL/dashboard?id=$PROJECT_KEY"
if [ "$result" = "OK" ]; then
  echo "QUALITY GATE PASSED"
  exit 0
fi

# 3. The gate failed: show the bugs and vulnerabilities behind it, so they are easy to find and fix.
# (Two query styles, because older and newer SonarQube versions name these filters differently.)
issues=$(call GET /api/issues/search -G \
    --data-urlencode "componentKeys=$PROJECT_KEY" \
    --data-urlencode "impactSoftwareQualities=RELIABILITY,SECURITY" \
    --data-urlencode "issueStatuses=OPEN,CONFIRMED" \
    --data-urlencode "ps=30" 2>/dev/null) ||
  issues=$(call GET /api/issues/search -G \
    --data-urlencode "componentKeys=$PROJECT_KEY" \
    --data-urlencode "types=BUG,VULNERABILITY" \
    --data-urlencode "resolved=false" \
    --data-urlencode "ps=30" 2>/dev/null) || issues=""

echo
echo "Reliability and security issues to fix:"
printf '%s' "$issues" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  let list=[];try{list=JSON.parse(s).issues||[]}catch(e){}
  if (!list.length) { console.log('  (could not list them here: open the dashboard link above and use the Issues tab)'); return; }
  for (const i of list) {
    const file=String(i.component).split(':').slice(1).join(':');
    console.log('  ['+i.severity+'] '+file+':'+(i.line||'?')+'  '+i.message+'  ('+i.rule+')');
  }
})"

echo
echo "QUALITY GATE FAILED (status: ${result:-unknown})" >&2
exit 1
