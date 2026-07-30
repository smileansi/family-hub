import os

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import date, datetime
from database import init_db, load_data, save_data
from energy_service import (
    dashboard as build_energy_dashboard,
    ensure_collector,
    is_demo,
    status as energy_status,
    sync_now as sync_energy_now,
)

app = Flask(__name__)

# CORS 설정 - 모든 출처에서의 요청 허용
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "PUT"], "allow_headers": ["Content-Type"]}})

init_db()
ensure_collector()

@app.route('/api/data', methods=['GET'])
def get_data():
    return jsonify(load_data())

@app.route('/api/data', methods=['POST'])
def update_data():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'success': False, 'error': 'JSON object required'}), 400
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    data = load_data()
    return jsonify(data['schedules'])

@app.route('/api/schedules', methods=['POST'])
def add_schedule():
    data = load_data()
    schedule = request.json
    schedule['id'] = int(datetime.now().timestamp() * 1000)
    data['schedules'].append(schedule)
    save_data(data)
    return jsonify(schedule)

@app.route('/api/schedules/<int:schedule_id>', methods=['DELETE'])
def delete_schedule(schedule_id):
    data = load_data()
    data['schedules'] = [s for s in data['schedules'] if s['id'] != schedule_id]
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/energy/dashboard', methods=['GET'])
def get_energy_dashboard():
    ensure_collector()
    try:
        selected = date.fromisoformat(request.args.get('date', date.today().isoformat()))
    except ValueError:
        return jsonify({'error': '날짜 형식은 YYYY-MM-DD여야 합니다.'}), 400
    try:
        return jsonify(build_energy_dashboard(selected))
    except Exception as exc:  # noqa: BLE001
        app.logger.exception('Energy dashboard failed')
        return jsonify({'error': str(exc)}), 500

@app.route('/api/energy/status', methods=['GET'])
def get_energy_status():
    ensure_collector()
    return jsonify({**energy_status, 'mode': 'demo' if is_demo() else 'kocom'})

@app.route('/api/energy/sync', methods=['POST'])
def sync_energy():
    ensure_collector()
    result = sync_energy_now(force=True)
    # 코콤 동기화 실패는 프록시 장애가 아니라 애플리케이션 수준의 결과다.
    # Cloudflare/Nginx가 502 응답 본문을 HTML 오류 페이지로 바꾸지 않도록
    # JSON 응답 자체는 200으로 전달하고, 성공 여부는 ok 필드로 구분한다.
    return jsonify(result)

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

@app.route('/')
def index():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
    asset_files = (
        'app.js',
        'style.css',
        'firebase-config.js',
        'manifest.webmanifest',
        'favicon.ico',
        'assets/icons/family-hub-32.png',
        'assets/icons/family-hub-180.png',
        'assets/icons/family-hub-192.png',
        'assets/icons/family-hub-512.png',
    )
    asset_version = str(max(os.stat(path).st_mtime_ns for path in asset_files))
    content = content.replace('__ASSET_VERSION__', asset_version)
    response = app.response_class(content, mimetype='text/html; charset=utf-8')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    app.run(
        host=os.getenv('FAMILY_HUB_HOST', '0.0.0.0'),
        port=int(os.getenv('FAMILY_HUB_PORT', '5000')),
        debug=False
    )
