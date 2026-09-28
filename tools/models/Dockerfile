# Headless Blender that builds the monsters' hand-sculpted 3D models (tools/models/build.py).
# Debian's own Blender package, so it runs natively on arm64 and amd64 alike (Blender's own
# downloads are x86-64 only); numpy and scikit-image for the distance-field sculpting;
# gltf-transform to compress the models (meshopt; three.js's GLTFLoader decodes it).
# The models it writes are committed: nothing else (the game build, the server image) needs it.
#
#   npm run models            (see tools/models/render.sh)
FROM debian:trixie-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends blender python3-numpy python3-skimage nodejs npm \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g --no-fund --no-audit @gltf-transform/cli@4 \
 && npm cache clean --force

ENV HOME=/tmp PYTHONUNBUFFERED=1
WORKDIR /app
ENTRYPOINT ["blender", "--background", "--factory-startup", "--python-exit-code", "1", "--python", "/app/build.py", "--"]
