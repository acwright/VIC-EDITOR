#!/usr/bin/env bash
# Build the Linux AppImage and deb (x64) via Docker (electronuserland/builder).
# Prerequisites: Docker Desktop running.
#
# node_modules is a named volume rather than a bind mount: the host's tree is
# macOS-arm64 and the container needs its own linux-x64 install, and keeping it
# in a volume means the second run skips the download.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  -v "${PROJECT_DIR}":/project \
  -v vic20-editor-linux-modules:/project/node_modules \
  -v "${HOME}/.cache/electron":/root/.cache/electron \
  -v "${HOME}/.cache/electron-builder":/root/.cache/electron-builder \
  electronuserland/builder \
  bash -c "cd /project && npm ci && npm run build && npx electron-builder --linux"
