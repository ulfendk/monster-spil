#!/usr/bin/env sh
# Builds the monsters' Blender models (tools/models/monsters/*.py) with headless Blender in
# Docker, into shared/content/creatures/<id>.glb (commit the result).
#   npm run models                         # build new/changed models
#   npm run models -- --only drageunge     # only some
#   npm run models -- --force              # rebuild even if unchanged
#   npm run models -- --preview            # also render preview PNGs into tools/models/.cache
set -e
cd "$(dirname "$0")/../.."
docker build -q -t monster-models tools/models >/dev/null
mkdir -p tools/models/.cache
exec docker run --rm \
  -v "$PWD/tools/models:/app" \
  -v "$PWD/tools/models/.cache:/cache" \
  -v "$PWD/shared/content/creatures:/out" \
  --user "$(id -u):$(id -g)" \
  monster-models --out /out --cache /cache --manifest /app/manifest.json "$@"
