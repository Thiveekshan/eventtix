#!/bin/sh
# Runs every security scan and saves the raw results in security-reports/.
# The results are judged afterwards by scripts/security-gate.js.
#
# Run with:  sh scripts/security-scan.sh
# Needs: IMAGE_TAG (set by the pipeline). Uses Docker and npm, which Jenkins already has.
#
# No "set -e": a finding must not stop the other scans from running.
set -u

OUT=security-reports
BACKEND_IMAGE="${BACKEND_IMAGE:-eventtix-backend}:${IMAGE_TAG:?IMAGE_TAG is not set}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-eventtix-frontend}:$IMAGE_TAG"

# An exact, pinned version: never "latest". In March 2026 attackers published malicious Trivy
# releases (v0.69.4 to v0.69.6, and the "latest" tag for a while), so versions are pinned on purpose.
TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:0.74.0}"

rm -rf "$OUT"
mkdir -p "$OUT"

# ---------------------------------------------------------------------------
echo "== 1/5  npm audit: backend dependencies used in production"
# npm exits with an error when it finds something; the gate script decides what that means.
(cd backend && npm audit --omit=dev --json) > "$OUT/npm-audit-backend.json" || true

echo "== 2/5  npm audit: frontend dependencies used in production"
(cd frontend && npm audit --omit=dev --json) > "$OUT/npm-audit-frontend.json" || true

# ---------------------------------------------------------------------------
# Trivy runs in its own container. It can read the built images through the Docker socket,
# and keeps its vulnerability database in a Docker volume so it is downloaded only once.
# No tokens or passwords are passed into it.
trivy_image() {
  docker run --rm \
    -v trivy-cache:/root/.cache/ \
    -v /var/run/docker.sock:/var/run/docker.sock \
    "$TRIVY_IMAGE" image --scanners vuln --format json --quiet "$1"
}

echo "== 3/5  Trivy: backend image ($BACKEND_IMAGE)"
trivy_image "$BACKEND_IMAGE" > "$OUT/trivy-image-backend.json" || true

echo "== 4/5  Trivy: frontend image ($FRONTEND_IMAGE)"
trivy_image "$FRONTEND_IMAGE" > "$OUT/trivy-image-frontend.json" || true

# ---------------------------------------------------------------------------
echo "== 5/5  Trivy: source code (secrets in files, unsafe Dockerfile settings)"
# Docker cannot mount the Jenkins workspace into another container, so the files are copied in.
cid=$(docker create -v trivy-cache:/root/.cache/ "$TRIVY_IMAGE" \
  fs --scanners secret,misconfig --format json --quiet /work) || cid=""
if [ -n "$cid" ]; then
  # (Top-level names are listed explicitly so the archive has no bare "./" entry.)
  tar -c --exclude=node_modules --exclude=.git --exclude=coverage --exclude=dist \
      --exclude=reports --exclude=security-reports --exclude=.scannerwork \
      --transform 's,^,work/,' -- $(ls -A) | docker cp - "$cid:/"
  docker start -a "$cid" > "$OUT/trivy-fs.json" || true
  docker rm -f "$cid" >/dev/null 2>&1 || true
fi

echo
echo "Scans finished. Raw results are in $OUT/"
ls -l "$OUT"
