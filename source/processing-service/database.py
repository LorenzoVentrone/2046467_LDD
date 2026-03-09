import aiosqlite
import os

DB_PATH = os.getenv("DB_PATH", "/data/rules.db")

CREATE_RULES = """
CREATE TABLE IF NOT EXISTS rules (
    id          TEXT PRIMARY KEY,
    sensor_id   TEXT NOT NULL,
    operator    TEXT NOT NULL,
    threshold   REAL NOT NULL,
    unit        TEXT,
    actuator_id TEXT NOT NULL,
    action      TEXT NOT NULL,
    permanent   INTEGER DEFAULT 0
);
"""

CREATE_RULE_LOGS = """
CREATE TABLE IF NOT EXISTS rule_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id      TEXT NOT NULL,
    sensor_id    TEXT NOT NULL,
    operator     TEXT NOT NULL,
    threshold    REAL NOT NULL,
    sensor_value REAL NOT NULL,
    actuator_id  TEXT NOT NULL,
    action       TEXT NOT NULL,
    fired_at     TEXT NOT NULL,
    FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
);
"""

# Safety rules seeded on startup — correspond to user stories US14–US19 plus two extras.
PERMANENT_RULES = [
    {"id": "perm-greenhouse-heat-on",    "sensor_id": "greenhouse_temperature", "operator": ">",  "threshold": 24.0,  "unit": "°C",    "actuator_id": "cooling_fan",         "action": "ON",  "permanent": 1},
    {"id": "perm-greenhouse-heat-off",   "sensor_id": "greenhouse_temperature", "operator": "<",  "threshold": 22.0,  "unit": "°C",    "actuator_id": "cooling_fan",         "action": "OFF", "permanent": 1},
    {"id": "perm-co2-vent-on",           "sensor_id": "co2_hall",               "operator": ">",  "threshold": 900.0,"unit": "ppm",   "actuator_id": "hall_ventilation",    "action": "ON",  "permanent": 1},
    {"id": "perm-co2-vent-off",          "sensor_id": "co2_hall",               "operator": "<",  "threshold": 600.0, "unit": "ppm",   "actuator_id": "hall_ventilation",    "action": "OFF", "permanent": 1},
    {"id": "perm-thermal-heat-on",       "sensor_id": "thermal_loop",           "operator": "<",  "threshold": 25.0,  "unit": "°C",    "actuator_id": "habitat_heater",      "action": "ON",  "permanent": 1},
    {"id": "perm-humidity-humidifier-on","sensor_id": "entrance_humidity",      "operator": "<",  "threshold": 40.0,  "unit": "%",     "actuator_id": "entrance_humidifier", "action": "ON",  "permanent": 1},
    {"id": "perm-humidity-humidifier-off","sensor_id": "entrance_humidity",     "operator": ">",  "threshold": 80.0,  "unit": "%",     "actuator_id": "entrance_humidifier", "action": "OFF", "permanent": 1},
    {"id": "perm-pm25-vent-on",          "sensor_id": "air_quality_pm25",       "operator": ">",  "threshold": 35.0,  "unit": "μg/m³", "actuator_id": "hall_ventilation",    "action": "ON",  "permanent": 1},
]


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["permanent"] = bool(d.get("permanent", 0))
    return d


async def init_db():
    dir_ = os.path.dirname(DB_PATH)
    if dir_:
        os.makedirs(dir_, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_RULES)
        await db.execute(CREATE_RULE_LOGS)
        # Migration: add permanent column to existing DBs that predate this schema.
        try:
            await db.execute("ALTER TABLE rules ADD COLUMN permanent INTEGER DEFAULT 0")
        except Exception:
            pass  # Column already exists
        await db.commit()


async def seed_permanent_rules():
    """Insert permanent safety rules if they do not already exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        for rule in PERMANENT_RULES:
            async with db.execute("SELECT id FROM rules WHERE id = ?", (rule["id"],)) as cur:
                if await cur.fetchone() is None:
                    await db.execute(
                        "INSERT INTO rules "
                        "(id, sensor_id, operator, threshold, unit, actuator_id, action, permanent) "
                        "VALUES (:id, :sensor_id, :operator, :threshold, :unit, :actuator_id, :action, :permanent)",
                        rule,
                    )
        await db.commit()


async def list_rules() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM rules ORDER BY permanent DESC, rowid ASC") as cur:
            rows = await cur.fetchall()
            return [_row_to_dict(r) for r in rows]


async def get_rule(rule_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)) as cur:
            row = await cur.fetchone()
            return _row_to_dict(row) if row else None


async def get_rules_for_sensor(sensor_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM rules WHERE sensor_id = ?", (sensor_id,)
        ) as cur:
            rows = await cur.fetchall()
            return [_row_to_dict(r) for r in rows]


async def insert_rule(rule: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO rules (id, sensor_id, operator, threshold, unit, actuator_id, action, permanent) "
            "VALUES (:id, :sensor_id, :operator, :threshold, :unit, :actuator_id, :action, :permanent)",
            {**rule, "permanent": rule.get("permanent", 0)},
        )
        await db.commit()


async def delete_rule(rule_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM rules WHERE id = ? AND permanent = 0", (rule_id,)
        )
        await db.commit()
        return cur.rowcount > 0


# ── Rule logs ──────────────────────────────────────────────────────────────────

async def insert_rule_log(log: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO rule_logs (rule_id, sensor_id, operator, threshold, sensor_value, actuator_id, action, fired_at) "
            "VALUES (:rule_id, :sensor_id, :operator, :threshold, :sensor_value, :actuator_id, :action, :fired_at)",
            log,
        )
        await db.commit()


async def get_recent_logs(limit: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM rule_logs ORDER BY id DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
