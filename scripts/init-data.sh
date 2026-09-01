#!/usr/bin/env bash
# Dev convenience: seed ./data from the git-tracked ./data.example reference copy,
# but only if ./data doesn't already exist. Never wired into the Docker image's
# CMD — production always uses the real bind-mounted DATA_DIR.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d data ]; then
  echo "data/ already exists, leaving it alone."
else
  cp -r data.example data
  echo "Seeded data/ from data.example/."
fi
