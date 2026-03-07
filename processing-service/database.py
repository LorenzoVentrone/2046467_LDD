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
    action      TEXT NOT NULL
);
"""

CREATE_RULE_LOGS = """
CREATE TABLE IF NOT EXISTS rule_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id     TEXT NOT NULL,
    sensor_id   TEXT NOT NULL,
    operator    TEXT NOT NULL,
    threshold   REAL NOT NULL,
    sensor_value REAL NOT NULL,
    actuator_id TEXT NOT NULL,
    action      TEXT NOT NULL,
    fired_at    TEXT NOT NULL,
    FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
);
"""


async def init_db():
    dir_ = os.path.dirname(DB_PATH)
    if dir_:
        os.makedirs(dir_, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_RULES)
        await db.execute(CREATE_RULE_LOGS)
        await db.commit()


async def list_rules() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM rules") as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def get_rules_for_sensor(sensor_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM rules WHERE sensor_id = ?", (sensor_id,)
        ) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def insert_rule(rule: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO rules (id, sensor_id, operator, threshold, unit, actuator_id, action) "
            "VALUES (:id, :sensor_id, :operator, :threshold, :unit, :actuator_id, :action)",
            rule,
        )
        await db.commit()


async def delete_rule(rule_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
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
