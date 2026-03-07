import aiosqlite
import os

DB_PATH = os.getenv("DB_PATH", "/data/rules.db")

CREATE_TABLE = """
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


async def init_db():
    dir_ = os.path.dirname(DB_PATH)
    if dir_:
        os.makedirs(dir_, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_TABLE)
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
