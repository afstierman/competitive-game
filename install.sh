#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo: sudo ./install.sh <folder-name>" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: sudo ./install.sh <folder-name>" >&2
  exit 2
fi

GAME_NAME=$1
if [[ ! $GAME_NAME =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Folder name may contain only letters, numbers, underscores, and hyphens." >&2
  exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ARCHIVE="$SCRIPT_DIR/website.zip"
WEB_ROOT=/var/www/html
APP_DIR="$WEB_ROOT/$GAME_NAME"
SERVICE_NAME="${GAME_NAME}.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"

if [[ ! -f $ARCHIVE ]]; then
  echo "Cannot find $ARCHIVE. Place website.zip beside install.sh." >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer currently supports Debian and Ubuntu systems (apt-get required)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 python3-venv python3-pip

install -d -o www-data -g www-data "$APP_DIR"
python3 -m zipfile -e "$ARCHIVE" "$APP_DIR"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --upgrade pip
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"
chown -R www-data:www-data "$APP_DIR"
chmod -R u=rwX,go=rX "$APP_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=$GAME_NAME web game
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
Environment=PYTHONUNBUFFERED=1
ExecStart=$APP_DIR/.venv/bin/gunicorn --workers 2 --bind 0.0.0.0:14980 app:app
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "Installed and started $GAME_NAME. Open http://<server-ip>:14980/game/"
