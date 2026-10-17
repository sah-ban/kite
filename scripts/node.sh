#!/usr/bin/env bash
set -euo pipefail
python3 scripts/resources.py
docker info >/dev/null
docker compose version >/dev/null
mkdir -p .freecast/node
cd .freecast/node
if [[ -n "${SNAPCHAIN_REF:-}" ]]; then
  RELEASE="$SNAPCHAIN_REF"
elif [[ -f release ]]; then
  RELEASE="$(cat release)"
else
  RELEASE="$(curl -fsSL --max-time 30 https://api.github.com/repos/farcasterxyz/snapchain/releases/latest | python3 -c 'import json,sys;print(json.load(sys.stdin)["tag_name"])')"
fi
[[ "$RELEASE" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Use a stable Snapchain release tag, e.g. 0.14.1.' >&2; exit 1; }
BASE="https://raw.githubusercontent.com/farcasterxyz/snapchain/$RELEASE"
curl -fsSL --max-time 30 "$BASE/docker-compose.mainnet.yml" -o compose.new.yml
curl -fsSL --max-time 30 "$BASE/validators.toml" -o validators.new.toml
python3 - "$RELEASE" <<'PY'
from pathlib import Path
import sys
compose=Path('compose.new.yml').read_text()
if 'read_node = true' not in compose: raise SystemExit('Upstream config is not explicitly a read node; review it before proceeding.')
compose=compose.replace('farcasterxyz/snapchain:latest', 'farcasterxyz/snapchain:'+sys.argv[1].removeprefix('v'))
compose=compose.replace('"3381:3381/tcp"','"127.0.0.1:3381:3381/tcp"').replace('"3383:3383/tcp"','"127.0.0.1:3383:3383/tcp"')
Path('docker-compose.yml').write_text(compose)
Path('validators.new.toml').replace('validators.toml')
Path('release').write_text(sys.argv[1])
PY
docker compose config --quiet
docker compose pull snapchain
docker compose up -d --no-deps snapchain
echo 'Read node started. Snapshot download and initial sync may take hours.'
echo 'Check progress: ./freecast status (from the repository root).'
