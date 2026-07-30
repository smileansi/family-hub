#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="family-hub"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$(id -un)}}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$(id -gn "$DEPLOY_USER")}"
VENV_DIR="$APP_DIR/venv"
BACKUP_DIR="$APP_DIR/backups"
SYSTEMD_TARGET="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SERVICE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SERVICE_NAME}"
LOCK_FILE="/tmp/${SERVICE_NAME}-deploy.lock"

log() {
    printf '[family-hub] %s\n' "$*"
}

fail() {
    printf '[family-hub] ERROR: %s\n' "$*" >&2
    exit 1
}

escape_sed_replacement() {
    printf '%s' "$1" | sed 's/[&|\\]/\\&/g'
}

[[ "$(uname -s)" == "Linux" ]] || fail "Linux 서버에서 실행해 주세요."
[[ -f "$APP_DIR/server.py" ]] || fail "server.py를 찾을 수 없습니다: $APP_DIR"
[[ -f "$APP_DIR/requirements.txt" ]] || fail "requirements.txt를 찾을 수 없습니다."
[[ "$DEPLOY_USER" != "root" ]] || fail "DEPLOY_USER를 실제 서비스 계정으로 지정해 주세요."
command -v sudo >/dev/null || fail "sudo가 필요합니다."
command -v flock >/dev/null || fail "flock 명령이 필요합니다."

exec 9>"$LOCK_FILE"
flock -n 9 || fail "다른 배포가 진행 중입니다."
sudo -v

TEMP_DIR="$(mktemp -d)"
NGINX_BACKUP="$TEMP_DIR/nginx.previous"
cleanup() {
    rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

escaped_app_dir="$(escape_sed_replacement "$APP_DIR")"
escaped_user="$(escape_sed_replacement "$DEPLOY_USER")"
escaped_group="$(escape_sed_replacement "$DEPLOY_GROUP")"

log "필수 시스템 패키지를 확인합니다."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 python3-pip python3-venv nginx

log "Python 실행 환경과 의존성을 준비합니다."
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    python3 -m venv "$VENV_DIR"
fi
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r "$APP_DIR/requirements.txt"

log "배포 전 애플리케이션을 검증합니다."
(
    cd "$APP_DIR"
    "$VENV_DIR/bin/python" -m compileall -q \
        server.py database.py energy_service.py kocom_client.py storage.py tariff.py
    "$VENV_DIR/bin/python" -c \
        "from server import app; assert app.test_client().get('/api/data').status_code == 200"
)

if [[ -f "$APP_DIR/family_hub.db" ]]; then
    log "SQLite 데이터베이스를 백업합니다."
    mkdir -p "$BACKUP_DIR"
    backup_path="$BACKUP_DIR/family_hub-$(date +%Y%m%d-%H%M%S).db"
    "$VENV_DIR/bin/python" - "$APP_DIR/family_hub.db" "$backup_path" <<'PY'
import sqlite3
import sys

source = sqlite3.connect(sys.argv[1])
destination = sqlite3.connect(sys.argv[2])
with destination:
    source.backup(destination)
destination.close()
source.close()
PY
fi

log "systemd 서비스 설정을 설치합니다."
sed \
    -e "s|__APP_USER__|$escaped_user|g" \
    -e "s|__APP_GROUP__|$escaped_group|g" \
    -e "s|__APP_DIR__|$escaped_app_dir|g" \
    "$APP_DIR/family-hub.service" > "$TEMP_DIR/family-hub.service"
sudo install -m 0644 "$TEMP_DIR/family-hub.service" "$SYSTEMD_TARGET"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

log "Nginx 설정을 검증하고 적용합니다."
sed \
    -e "s|__APP_DIR__|$escaped_app_dir|g" \
    "$APP_DIR/nginx.conf" > "$TEMP_DIR/nginx.conf"

if sudo test -f "$NGINX_AVAILABLE"; then
    sudo cp "$NGINX_AVAILABLE" "$NGINX_BACKUP"
fi
sudo install -m 0644 "$TEMP_DIR/nginx.conf" "$NGINX_AVAILABLE"
sudo ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"

if ! sudo nginx -t; then
    log "Nginx 검증 실패로 이전 설정을 복구합니다."
    if [[ -f "$NGINX_BACKUP" ]]; then
        sudo cp "$NGINX_BACKUP" "$NGINX_AVAILABLE"
    else
        sudo rm -f "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    fi
    sudo nginx -t || true
    fail "Nginx 설정을 적용하지 않았습니다."
fi

log "서비스를 재시작합니다."
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME" \
    || fail "Family Hub 서비스가 시작되지 않았습니다."
sudo systemctl reload nginx

log "배포가 완료되었습니다."
log "상태 확인: sudo systemctl status ${SERVICE_NAME} --no-pager"
