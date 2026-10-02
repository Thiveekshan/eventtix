#!/bin/sh
# Helpers shared by the SonarQube pipeline scripts.
# Plain POSIX sh, so no bash is needed. Uses curl and node, which Jenkins already has.

: "${SONAR_HOST_URL:?SONAR_HOST_URL is not set}"
: "${SONAR_TOKEN:?SONAR_TOKEN is not set}"

# Reads JSON on stdin and prints a JavaScript expression about it. Prints nothing if it cannot.
# Example:  echo "$body" | json 'o.task.status'
json() {
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let v='';try{const o=JSON.parse(s);v=($1)}catch(e){}console.log(v===undefined||v===null?'':v)})"
}

# call METHOD PATH [curl options...]
# Calls the SonarQube web API with the token. Prints the response body on success;
# on an HTTP error it prints the body to stderr and returns 1.
call() {
  _method=$1
  _path=$2
  shift 2
  _out=$(mktemp)
  _code=$(curl -sS -o "$_out" -w '%{http_code}' -u "$SONAR_TOKEN:" -X "$_method" "$SONAR_HOST_URL$_path" "$@") || {
    rm -f "$_out"
    return 1
  }
  case $_code in
    2*)
      cat "$_out"
      rm -f "$_out"
      return 0
      ;;
  esac
  echo "SonarQube API $_method $_path failed with HTTP $_code" >&2
  cat "$_out" >&2
  echo >&2
  rm -f "$_out"
  return 1
}

# Waits until SonarQube reports that it is UP (it needs a minute or two after starting).
wait_for_sonarqube() {
  echo "Waiting for SonarQube at $SONAR_HOST_URL ..."
  _i=0
  while :; do
    _status=$(curl -s "$SONAR_HOST_URL/api/system/status" | json 'o.status')
    if [ "$_status" = "UP" ]; then
      echo "SonarQube is UP"
      return 0
    fi
    _i=$((_i + 1))
    if [ "$_i" -ge "${SONAR_WAIT_ATTEMPTS:-60}" ]; then
      echo "SonarQube is not ready (status: ${_status:-unreachable})" >&2
      return 1
    fi
    sleep "${SONAR_WAIT_SECONDS:-5}"
  done
}
