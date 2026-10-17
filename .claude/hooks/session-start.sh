#!/bin/bash
# SessionStart hook for Claude Code cloud sessions: brings the container up to
# what `pnpm test && pnpm build` and `pnpm smoke:render` need. A local session
# (the owner's own checkout, or Remote Control on it) exits on the first line.
#
# The cloud image ships Node 22 and this repository's floor is 24 (ADR-0110),
# so the hook installs a pinned Node 24, checked against nodejs.org's published
# SHA256, into $HOME. The pin is deliberately not the newest 24.x: it is held
# outside the seven-day window `pnpm-workspace.yaml` applies to every package.
# Bump NODE_VERSION and NODE_SHA256 together.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

NODE_VERSION=v24.21.0
NODE_SHA256=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 # linux-x64
NODE_DIR="$HOME/.local/node-$NODE_VERSION"

if [ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]; then
  echo "session-start: no pinned Node for $(uname -s)-$(uname -m); leaving Node as it is" >&2
elif [ ! -x "$NODE_DIR/bin/node" ]; then
  tarball="node-$NODE_VERSION-linux-x64.tar.xz"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$tarball" -o "$tmp/$tarball"
  echo "$NODE_SHA256  $tmp/$tarball" | sha256sum -c --quiet -
  mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/$tarball" -C "$NODE_DIR" --strip-components=1
fi

if [ -x "$NODE_DIR/bin/node" ]; then
  export PATH="$NODE_DIR/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

# pnpm itself comes from `packageManager` in package.json, through corepack.
corepack enable --install-directory "$NODE_DIR/bin" >/dev/null 2>&1 || corepack enable

# `smoke:render` looks for Chrome at fixed paths only; the image's Chromium is
# at /opt/pw-browsers. A wrapper there, rather than a change to the script, so
# the gate's own code stays the same on every machine. The container runs as
# root, where Chromium refuses to start without --no-sandbox; a GitHub runner
# and the owner's machine do not, so nothing outside this container passes it.
if [ ! -e /usr/bin/google-chrome ] && [ -x /opt/pw-browsers/chromium ]; then
  printf '#!/bin/sh\nexec /opt/pw-browsers/chromium --no-sandbox "$@"\n' \
    > /usr/bin/google-chrome 2>/dev/null && chmod +x /usr/bin/google-chrome || true
fi

# This container has no GPU, which is what `glArgs()` in smoke-render.ts reads
# CI=true to mean: without it Chrome gets no WebGL context and the gate times
# out. Set before the install as well as for the session, because pnpm lays out
# node_modules differently under CI and a mismatch makes every later `pnpm`
# command warn that node_modules is out of sync.
export CI=true
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export CI=true' >> "$CLAUDE_ENV_FILE"
fi

cd "$CLAUDE_PROJECT_DIR"
# Not frozen, which CI=true would otherwise make it: pnpm applies the seven-day
# window to a frozen install too, and would refuse a lockfile entry committed
# inside it.
pnpm install --no-frozen-lockfile
