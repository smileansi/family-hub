from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
from datetime import datetime

app = Flask(__name__)

# CORS 설정 - 모든 출처에서의 요청 허용
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "PUT"], "allow_headers": ["Content-Type"]}})

DATA_FILE = 'family_data.json'

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'events': [],
        'bulletins': [],
        'schedules': [],
        'scheduleMembers': [],
        'todos': [],
        'shopping': []
    }

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/data', methods=['GET'])
def get_data():
    return jsonify(load_data())

@app.route('/api/data', methods=['POST'])
def update_data():
    data = request.json
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
