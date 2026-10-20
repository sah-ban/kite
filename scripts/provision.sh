#!/usr/bin/env bash
set -euo pipefail
python3 scripts/resources.py
source /etc/os-release
[[ "$ID" == ubuntu ]] || { echo 'Automatic Docker setup supports Ubuntu. Install Docker Compose v2 manually on this OS.' >&2; exit 1; }
if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo 'Docker and Compose are ready. Next: ./kiteapp node'; exit 0
fi
if command -v docker >/dev/null; then
  echo 'Docker is installed but not accessible or Compose v2 is missing. Ask the host administrator to configure Docker access, then retry.' >&2; exit 1
fi
SUDO=()
if [[ "$EUID" -ne 0 ]]; then SUDO=(sudo); fi
"${SUDO[@]}" apt-get update
"${SUDO[@]}" apt-get install -y ca-certificates curl
"${SUDO[@]}" install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | "${SUDO[@]}" tee /etc/apt/keyrings/docker.asc >/dev/null
"${SUDO[@]}" chmod a+r /etc/apt/keyrings/docker.asc
ARCH="$(dpkg --print-architecture)"
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | "${SUDO[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null
"${SUDO[@]}" apt-get update
"${SUDO[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
if [[ "$EUID" -ne 0 ]]; then
  "${SUDO[@]}" usermod -aG docker "$(id -un)"
  echo 'Docker installed. Sign out and reconnect so Docker group access takes effect.'
else echo 'Docker is ready. Next: ./kiteapp node'; fi
