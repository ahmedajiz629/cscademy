#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_HOST="${DEPLOY_HOST:-vps-3bdcb71e.vps.ovh.net}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/apps/ajiz-tech-challenge}"
APP_SERVICE="${APP_SERVICE:-ajiz-next.service}"
CONVEX_SERVICE="${CONVEX_SERVICE:-ajiz-convex.service}"
NGINX_SERVICE="${NGINX_SERVICE:-nginx.service}"
REMOTE_ARCHIVE="${REMOTE_ARCHIVE:-/tmp/ajiz-tech-challenge-deploy.tgz}"
RESTART_CONVEX="${RESTART_CONVEX:-0}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
SSH_PORT="${SSH_PORT:-}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"

usage() {
  cat <<'EOF'
Usage: ./publish.sh [--restart-convex] [--skip-install]

Uploads the current working tree to the VPS, preserves remote deployment state,
builds the app on the server, and restarts the public app service.

Environment overrides:
  DEPLOY_USER           Remote SSH user
  DEPLOY_HOST           Remote host
  DEPLOY_DIR            Remote app directory
  APP_SERVICE           Next.js systemd service
  CONVEX_SERVICE        Convex systemd service
  NGINX_SERVICE         Nginx systemd service
  REMOTE_ARCHIVE        Temporary upload path on the server
  SSH_PORT              SSH port
  SSH_IDENTITY_FILE     SSH private key path
  RESTART_CONVEX=1      Restart Convex after deploy
  SKIP_INSTALL=1        Skip pnpm install on the server
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

while (($# > 0)); do
  case "$1" in
    --restart-convex)
      RESTART_CONVEX=1
      ;;
    --skip-install)
      SKIP_INSTALL=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_command ssh
require_command scp
require_command tar
require_command mktemp

SSH_ARGS=(-o StrictHostKeyChecking=accept-new)
SCP_ARGS=(-o StrictHostKeyChecking=accept-new)

if [[ -n "$SSH_PORT" ]]; then
  SSH_ARGS+=(-p "$SSH_PORT")
  SCP_ARGS+=(-P "$SSH_PORT")
fi

if [[ -n "$SSH_IDENTITY_FILE" ]]; then
  SSH_ARGS+=(-i "$SSH_IDENTITY_FILE")
  SCP_ARGS+=(-i "$SSH_IDENTITY_FILE")
fi

REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
ARCHIVE_PATH="$(mktemp "${TMPDIR:-/tmp}/ajiz-tech-challenge.XXXXXX.tgz")"

cleanup() {
  rm -f "$ARCHIVE_PATH"
}

trap cleanup EXIT

EXCLUDES=(
  ".git"
  ".convex"
  ".next"
  "node_modules"
  "coverage"
  "out"
  "build"
  ".pnp"
  ".pnp.*"
  ".yarn"
  ".vercel"
  ".DS_Store"
  "*.pem"
  "*.tsbuildinfo"
  ".env.local"
  ".env.development.local"
  ".env.production.local"
  ".env.test.local"
  "npm-debug.log*"
  "yarn-debug.log*"
  "yarn-error.log*"
  ".pnpm-debug.log*"
)

TAR_EXCLUDES=()
for pattern in "${EXCLUDES[@]}"; do
  TAR_EXCLUDES+=(--exclude="$pattern")
done

echo "Creating deployment archive from $PROJECT_DIR"
tar -czf "$ARCHIVE_PATH" "${TAR_EXCLUDES[@]}" -C "$PROJECT_DIR" .

echo "Ensuring remote directory exists: $DEPLOY_DIR"
ssh "${SSH_ARGS[@]}" "$REMOTE_TARGET" "mkdir -p '$DEPLOY_DIR'"

echo "Uploading archive to $REMOTE_TARGET"
scp "${SCP_ARGS[@]}" "$ARCHIVE_PATH" "$REMOTE_TARGET:$REMOTE_ARCHIVE"

echo "Deploying on server"
ssh "${SSH_ARGS[@]}" "$REMOTE_TARGET" \
  "bash -s -- '$DEPLOY_DIR' '$REMOTE_ARCHIVE' '$APP_SERVICE' '$CONVEX_SERVICE' '$NGINX_SERVICE' '$RESTART_CONVEX' '$SKIP_INSTALL'" <<'EOF'
set -euo pipefail

DEPLOY_DIR="$1"
REMOTE_ARCHIVE="$2"
APP_SERVICE="$3"
CONVEX_SERVICE="$4"
NGINX_SERVICE="$5"
RESTART_CONVEX="$6"
SKIP_INSTALL="$7"

mkdir -p "$DEPLOY_DIR"

shopt -s dotglob nullglob
for entry in "$DEPLOY_DIR"/* "$DEPLOY_DIR"/.[!.]* "$DEPLOY_DIR"/..?*; do
  [[ -e "$entry" ]] || continue
  name="$(basename "$entry")"
  case "$name" in
    .|..|.git|.convex|.env.local|.env.server|node_modules)
      continue
      ;;
  esac
  rm -rf "$entry"
done
shopt -u dotglob nullglob

tar -xzf "$REMOTE_ARCHIVE" -C "$DEPLOY_DIR"
rm -f "$REMOTE_ARCHIVE"

cd "$DEPLOY_DIR"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  pnpm install --frozen-lockfile
fi

set -a
source ./.env.server
set +a
pnpm build

sudo systemctl restart "$APP_SERVICE"

if [[ "$RESTART_CONVEX" == "1" ]]; then
  sudo systemctl restart "$CONVEX_SERVICE"
fi

systemctl is-active "$APP_SERVICE" "$CONVEX_SERVICE" "$NGINX_SERVICE"
EOF

echo "Publish completed successfully"