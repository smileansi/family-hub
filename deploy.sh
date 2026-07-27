#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="family-hub"
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${SUDO_USER:-$(id -un)}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-}"

on_error() {
    echo
    echo "Deployment failed at line $1."
    echo "Check logs with: sudo journalctl -u ${APP_NAME} -n 100 --no-pager"
}
trap 'on_error $LINENO' ERR

echo "[1/7] Preparing system packages"
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv nginx curl

if [[ -n "${DEPLOY_BRANCH}" ]]; then
    echo "[2/7] Updating Git branch: ${DEPLOY_BRANCH}"
    git -C "${APP_DIR}" fetch origin "${DEPLOY_BRANCH}"
    git -C "${APP_DIR}" switch "${DEPLOY_BRANCH}"
    git -C "${APP_DIR}" pull --ff-only origin "${DEPLOY_BRANCH}"
else
    echo "[2/7] Using the current working tree (set DEPLOY_BRANCH to pull automatically)"
fi

echo "[3/7] Creating Python environment"
python3 -m venv "${APP_DIR}/venv"
"${APP_DIR}/venv/bin/python" -m pip install --upgrade pip
"${APP_DIR}/venv/bin/pip" install -r "${APP_DIR}/requirements.txt"
"${APP_DIR}/venv/bin/pip" install "gunicorn>=22,<24"

echo "[4/7] Initializing SQLite"
sudo -u "${APP_USER}" "${APP_DIR}/venv/bin/python" "${APP_DIR}/database.py"

echo "[5/7] Installing systemd service"
sed \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__APP_USER__|${APP_USER}|g" \
    "${APP_DIR}/family-hub.service" | sudo tee "${SERVICE_FILE}" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable "${APP_NAME}"
sudo systemctl restart "${APP_NAME}"

echo "[6/7] Installing Nginx configuration"
sudo mkdir -p /var/www/family-hub
sudo rm -rf /var/www/family-hub/landing
sudo cp -a "${APP_DIR}/landing" /var/www/family-hub/landing
sudo cp "${APP_DIR}/nginx.conf" "${NGINX_AVAILABLE}"
sudo ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
sudo nginx -t
sudo systemctl reload nginx

echo "[7/7] Verifying services"
sudo systemctl is-active --quiet "${APP_NAME}"
sudo systemctl is-active --quiet nginx

for attempt in {1..10}; do
    if curl --fail --silent --show-error \
        --max-time 3 \
        -H "Host: localhost" \
        "http://127.0.0.1:5000/api/data" >/dev/null; then
        echo "Deployment complete: Family Hub is responding."
        echo "App directory: ${APP_DIR}"
        exit 0
    fi
    sleep 1
done

echo "Services started, but the health check failed."
sudo journalctl -u "${APP_NAME}" -n 50 --no-pager
exit 1
