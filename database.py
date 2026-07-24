import json
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "family_hub.db"
LEGACY_JSON_PATH = BASE_DIR / "family_data.json"

COLLECTION_TABLES = {
    "events": "events",
    "bulletins": "bulletins",
    "schedules": "schedules",
    "todos": "todos",
    "shopping": "shopping_items",
}

DEFAULT_DATA = {
    "events": [],
    "bulletins": [],
    "schedules": [],
    "scheduleMembers": [],
    "scheduleMemberInfo": {},
    "activeScheduleMember": "전체",
    "todos": [],
    "shopping": [],
    "weatherLocation": "",
}


def get_connection():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_db():
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bulletins (
                id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shopping_items (
                id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedule_members (
                name TEXT PRIMARY KEY,
                position INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedule_member_info (
                member_name TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                FOREIGN KEY (member_name) REFERENCES schedule_members(name)
                    ON UPDATE CASCADE ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_position ON events(position);
            CREATE INDEX IF NOT EXISTS idx_bulletins_position ON bulletins(position);
            CREATE INDEX IF NOT EXISTS idx_schedules_position ON schedules(position);
            CREATE INDEX IF NOT EXISTS idx_todos_position ON todos(position);
            CREATE INDEX IF NOT EXISTS idx_shopping_position ON shopping_items(position);
            """
        )

        migrated = connection.execute(
            "SELECT value FROM settings WHERE key = 'legacy_json_migrated'"
        ).fetchone()
        if migrated is None:
            legacy_data = _read_legacy_json()
            if legacy_data is not None:
                _replace_all(connection, legacy_data)
            connection.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)",
                ("legacy_json_migrated", "1"),
            )


def _read_legacy_json():
    if not LEGACY_JSON_PATH.exists():
        return None
    with LEGACY_JSON_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def _item_id(item, position):
    item_id = item.get("id")
    return item_id if isinstance(item_id, int) else -(position + 1)


def _replace_collection(connection, table, items):
    connection.execute(f"DELETE FROM {table}")
    connection.executemany(
        f"INSERT INTO {table}(id, position, data) VALUES (?, ?, ?)",
        [
            (
                _item_id(item, position),
                position,
                json.dumps(item, ensure_ascii=False, separators=(",", ":")),
            )
            for position, item in enumerate(items)
        ],
    )


def _replace_all(connection, data):
    for key, table in COLLECTION_TABLES.items():
        _replace_collection(connection, table, data.get(key, []))

    connection.execute("DELETE FROM schedule_member_info")
    connection.execute("DELETE FROM schedule_members")

    members = data.get("scheduleMembers", [])
    member_info = data.get("scheduleMemberInfo", {})
    all_member_names = list(dict.fromkeys([*members, *member_info.keys()]))

    connection.executemany(
        "INSERT INTO schedule_members(name, position) VALUES (?, ?)",
        [(name, position) for position, name in enumerate(all_member_names)],
    )
    connection.executemany(
        "INSERT INTO schedule_member_info(member_name, data) VALUES (?, ?)",
        [
            (
                name,
                json.dumps(info, ensure_ascii=False, separators=(",", ":")),
            )
            for name, info in member_info.items()
        ],
    )

    for key, value in {
        "activeScheduleMember": data.get("activeScheduleMember", "전체"),
        "weatherLocation": data.get("weatherLocation", ""),
    }.items():
        connection.execute(
            "INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)",
            (key, value),
        )


def load_data():
    init_db()
    result = dict(DEFAULT_DATA)
    with get_connection() as connection:
        for key, table in COLLECTION_TABLES.items():
            rows = connection.execute(
                f"SELECT data FROM {table} ORDER BY position, id"
            ).fetchall()
            result[key] = [json.loads(row["data"]) for row in rows]

        member_rows = connection.execute(
            "SELECT name FROM schedule_members ORDER BY position, name"
        ).fetchall()
        result["scheduleMembers"] = [row["name"] for row in member_rows]

        info_rows = connection.execute(
            "SELECT member_name, data FROM schedule_member_info"
        ).fetchall()
        result["scheduleMemberInfo"] = {
            row["member_name"]: json.loads(row["data"]) for row in info_rows
        }

        settings = connection.execute(
            "SELECT key, value FROM settings "
            "WHERE key IN ('activeScheduleMember', 'weatherLocation')"
        ).fetchall()
        for row in settings:
            result[row["key"]] = row["value"]
    return result


def save_data(data):
    init_db()
    with get_connection() as connection:
        _replace_all(connection, data)


if __name__ == "__main__":
    init_db()
    data = load_data()
    counts = ", ".join(f"{key}={len(data[key])}" for key in COLLECTION_TABLES)
    print(f"SQLite ready: {DB_PATH}")
    print(f"Migrated data: {counts}")
