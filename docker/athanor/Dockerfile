# The image `athanor run` tests stacks in: see docs/commands.md and ADR-0122.
#
# athanor untars the working tree into $HOME/work and runs the command there,
# with no network. So the workspace is installed into that same folder here,
# at build time, where the network is: node_modules is gitignored, the snapshot
# never carries it, and the untar lays the tree over it.
FROM node:24-bookworm-slim

# git, so athanor's boot script makes the snapshot a one-commit repo for the
# gates that call `git ls-files`. No browser: the one gate that needed
# Chromium, with its `--no-sandbox` shim, left in #618 (ADR-0171, which amends
# ADR-0122 on this point), so the accepted sandbox risk left with it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# Exactly packageManager's version: any other makes pnpm fetch that one, which
# fails offline.
RUN npm install -g pnpm@11.18.0

USER node
WORKDIR /home/node/work

# The manifests only, so a source edit never rebuilds the image. athanor keys
# the image on these same files through `inputs` in package.json.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/ask/package.json packages/ask/
COPY --chown=node:node packages/cli/package.json packages/cli/
COPY --chown=node:node packages/core/package.json packages/core/
COPY --chown=node:node packages/site/package.json packages/site/

# HUSKY=0: there is no .git yet for `prepare` to install hooks into.
RUN HUSKY=0 pnpm install --frozen-lockfile
