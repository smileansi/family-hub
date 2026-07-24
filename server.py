from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
from database import init_db, load_data, save_data

app = Flask(__name__)

# CORS 설정 - 모든 출처에서의 요청 허용
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "PUT"], "allow_headers": ["Content-Type"]}})

init_db()

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

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

@app.route('/')
def index():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
    response = app.response_class(content, mimetype='text/html; charset=utf-8')
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
