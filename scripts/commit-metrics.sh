#!/usr/bin/env bash
#
# Put this run's `.prom` file on the orphan `metrics` branch.
#
# Called by both halves of `.github/workflows/metrics.yml`, which is the only
# caller and the only place with `contents: write`. Nothing on `main` is
# touched: the branch is fetched into a worktree of its own, the file is copied
# across, and the worktree is thrown away.
#
# ⚠️ The branch is created here when it is absent, rather than being a
# precondition somebody has to remember. A workflow that needs a branch a human
# made once is a workflow that silently stops working the day somebody prunes
# it — and the failure would look like a dead pipe rather than like a missing
# ref.
#
# ⚠️ Nothing here ever creates a local branch called `metrics`, and that is not
# tidiness. The first version did `switch -c metrics`, which works once and
# fails on the second run in the same clone with *"a branch named 'metrics'
# already exists"* — invisible in CI, where every run is a fresh checkout, and
# immediate against a scratch remote. **The bug was found by running this script
# twice**, which is the only reason the second path is known to work at all. So:
# detached HEAD, a per-run staging branch where git insists on a name, and
# `push HEAD:metrics`.
#
# ⚠️ `git -c user.name=…` rather than `git config user.name …`, which would
# mutate the checkout — invisible in CI and rude anywhere else, and it makes the
# script untestable against a scratch clone.
#
# Retried on rejection, because a merge and a nightly can land minutes apart.
# One file per run reduces the race to a ref update, which rebase resolves
# without touching bytes; there is no shared file for two runs to contend on.

set -euo pipefail

BRANCH=metrics
SOURCE="${1:-metrics}"
WORKTREE="$(mktemp -d)/record"
STAGING="metrics-staging-$$"

AUTHOR=(-c "user.name=github-actions[bot]"
        -c "user.email=41898282+github-actions[bot]@users.noreply.github.com")

cleanup() {
  git worktree remove --force "$WORKTREE" 2>/dev/null || true
  git branch -D "$STAGING" 2>/dev/null || true
}
trap cleanup EXIT

if [ ! -d "$SOURCE" ]; then
  echo "no $SOURCE/ directory — emit-metrics.ts writes one per run, so this is a bug" >&2
  exit 1
fi

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch origin "$BRANCH" --depth=1
  git worktree add --detach "$WORKTREE" FETCH_HEAD
else
  # `--orphan` rather than branching off main: the record shares no history with
  # the code, and a metrics branch carrying the whole tree would make every
  # `trend:sync` fetch the repository twice. The staging name is per-run and
  # never `metrics`; the push is what names the branch on the remote.
  git worktree add --detach "$WORKTREE" HEAD
  git -C "$WORKTREE" switch --orphan "$STAGING"
  git -C "$WORKTREE" rm -rf --quiet . 2>/dev/null || true
fi

mkdir -p "$WORKTREE/metrics"
cp "$SOURCE"/*.prom "$WORKTREE/metrics/"

git -C "$WORKTREE" add metrics
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "nothing new to record"
  exit 0
fi

git "${AUTHOR[@]}" -C "$WORKTREE" commit -m "metrics: ${GITHUB_SHA:-local} (${GITHUB_EVENT_NAME:-manual})"

for attempt in 1 2 3; do
  if git -C "$WORKTREE" push origin "HEAD:refs/heads/$BRANCH"; then
    exit 0
  fi
  if [ "$attempt" = 3 ]; then
    echo "could not push the record after three attempts" >&2
    exit 1
  fi
  echo "push $attempt rejected; rebasing on the branch tip and retrying" >&2
  git "${AUTHOR[@]}" -C "$WORKTREE" pull --rebase origin "$BRANCH"
done
