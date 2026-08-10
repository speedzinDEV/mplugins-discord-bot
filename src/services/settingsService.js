'use strict';

const db = require('./database');

async function get(key, fallback = null) {
  const result = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (result.rowCount === 0) return fallback;
  return result.rows[0].value;
}

async function set(key, value) {
  await db.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, String(value)]
  );
}

async function getNumber(key, fallback) {
  const raw = await get(key, null);
  if (raw === null) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

module.exports = { get, set, getNumber };
