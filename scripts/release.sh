#!/bin/sh
# Release: store this build's images in the registry, tag the commit in Git,
# and publish a GitHub release with notes. (Deploying to production is the next step: scripts/deploy.sh.)
#
# Run with:  sh scripts/release.sh
#
# Needs these environment variables (the Jenkins pipeline sets them):
#   IMAGE_TAG    version being released, e.g. 1.0.0.9
#   GIT_COMMIT   the commit that was built
#   BUILD_NUMBER Jenkins build number
#   GIT_USER, GIT_PASS   GitHub user name and access token (from Jenkins credentials)
set -eu

TAG="${IMAGE_TAG:?IMAGE_TAG is not set}"
COMMIT="${GIT_COMMIT:?GIT_COMMIT is not set}"
BUILD="${BUILD_NUMBER:?BUILD_NUMBER is not set}"
BACKEND_IMAGE="${BACKEND_IMAGE:-eventtix-backend}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-eventtix-frontend}"

# The Docker engine pushes to localhost:5000 (published by the registry container).
# Jenkins itself reaches the same registry by its container name on the CI network.
REGISTRY="${REGISTRY:-localhost:5000}"
REGISTRY_CHECK_URL="${REGISTRY_CHECK_URL:-http://registry:5000/v2/}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"

RELEASE_TAG="v$TAG"
SHORT="$(printf '%s' "$COMMIT" | cut -c1-7)"
INFO_FILE="${RELEASE_INFO_FILE:-release-info.txt}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
echo "== 1/4  Checking the build is ready to release"
for image in "$BACKEND_IMAGE" "$FRONTEND_IMAGE"; do
  docker image inspect "$image:$TAG" >/dev/null 2>&1 || fail "image $image:$TAG does not exist on this machine"
done
curl -fsS -m 10 "$REGISTRY_CHECK_URL" >/dev/null 2>&1 ||
  fail "the image registry is not reachable at $REGISTRY_CHECK_URL (start it with: cd jenkins && docker compose up -d)"
echo "   images exist and the registry is up"

# ---------------------------------------------------------------------------
echo "== 2/4  Storing the images in the registry ($REGISTRY)"
backend_digest=""
frontend_digest=""
for image in "$BACKEND_IMAGE" "$FRONTEND_IMAGE"; do
  stored="$REGISTRY/$image:$TAG"
  docker tag "$image:$TAG" "$stored"
  docker push "$stored" >/dev/null
  digest=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$stored" | grep "^$REGISTRY/" | head -n 1 || true)
  echo "   stored $stored"
  echo "          ${digest:-digest not available}"
  if [ "$image" = "$BACKEND_IMAGE" ]; then backend_digest="$digest"; else frontend_digest="$digest"; fi
done

# ---------------------------------------------------------------------------
echo "== 3/4  Tagging the commit in Git as $RELEASE_TAG"
if git rev-parse -q --verify "refs/tags/$RELEASE_TAG" >/dev/null; then
  existing=$(git rev-list -n 1 "$RELEASE_TAG")
  [ "$existing" = "$COMMIT" ] || fail "tag $RELEASE_TAG already exists but points to a different commit"
  echo "   tag already exists on this commit"
else
  git -c user.name="Jenkins" -c user.email="jenkins@eventtix.local" \
    tag -a "$RELEASE_TAG" "$COMMIT" -m "EventTix $TAG (Jenkins build #$BUILD, commit $SHORT)"
  echo "   created tag $RELEASE_TAG on $SHORT"
fi

# The access token is handed to git through a helper program, so it never appears on a command line.
ASKPASS=$(mktemp)
trap 'rm -f "$ASKPASS"' EXIT
cat > "$ASKPASS" <<'HELPER'
#!/bin/sh
case "$1" in
  Username*) printf '%s\n' "${GIT_USER:-}" ;;
  *) printf '%s\n' "${GIT_PASS:-}" ;;
esac
HELPER
chmod 700 "$ASKPASS"
GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 git push origin "refs/tags/$RELEASE_TAG"

# ---------------------------------------------------------------------------
echo "== 4/4  Publishing the GitHub release"
previous=$(git tag --list 'v*' --sort=-v:refname | grep -v "^$RELEASE_TAG$" | head -n 1 || true)
if [ -n "$previous" ]; then
  range="$previous..$COMMIT"
else
  range="$COMMIT"
fi
changes=$(git log --no-merges --pretty='- %s (%h)' "$range" | head -n 30)

NOTES=$(cat <<NOTES_END
## EventTix $TAG

Built and released automatically by Jenkins build #$BUILD from commit \`$SHORT\`.
It passed every earlier stage: build, tests, code quality gate, security scans and a staging deployment with smoke test.

### Stored images (registry $REGISTRY)
- \`$BACKEND_IMAGE:$TAG\`  ${backend_digest:+\`$backend_digest\`}
- \`$FRONTEND_IMAGE:$TAG\`  ${frontend_digest:+\`$frontend_digest\`}

### Changes since ${previous:-the beginning}
$changes
NOTES_END
)

# Works out "owner/repository" from the remote address, for example Thiveekshan/eventtix.
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
payload=$(TAG_NAME="$RELEASE_TAG" TITLE="EventTix $TAG" BODY="$NOTES" COMMIT_SHA="$COMMIT" node -e "
process.stdout.write(JSON.stringify({
  tag_name: process.env.TAG_NAME,
  name: process.env.TITLE,
  body: process.env.BODY,
  target_commitish: process.env.COMMIT_SHA,
  draft: false,
  prerelease: false,
}));")

response=$(mktemp)
# The Authorization header is read from standard input so the token is not visible in the process list.
code=$(printf 'header = "Authorization: Bearer %s"\n' "${GIT_PASS:-}" | curl -sS -m 30 -K - \
  -o "$response" -w '%{http_code}' -X POST \
  -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "$payload" "$GITHUB_API/repos/$slug/releases" || echo "000")
case "$code" in
  201) echo "   published: https://github.com/$slug/releases/tag/$RELEASE_TAG" ;;
  422) echo "   a release for $RELEASE_TAG already exists (nothing to do)" ;;
  *)   echo "   WARNING: GitHub release was not created (HTTP $code). The image and Git tag are in place." >&2
       head -c 300 "$response" >&2; echo >&2 ;;
esac
rm -f "$response"

# ---------------------------------------------------------------------------
{
  echo "release=$RELEASE_TAG"
  echo "version=$TAG"
  echo "jenkins_build=$BUILD"
  echo "commit=$COMMIT"
  echo "released_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "backend_image=${backend_digest:-$REGISTRY/$BACKEND_IMAGE:$TAG}"
  echo "frontend_image=${frontend_digest:-$REGISTRY/$FRONTEND_IMAGE:$TAG}"
} > "$INFO_FILE"
echo
echo "RELEASED $RELEASE_TAG  (details saved in $INFO_FILE)"
