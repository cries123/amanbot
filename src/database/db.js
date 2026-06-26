import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!config.database.url) {
    return null;
  }
  if (!pool) {
    pool = new Pool({ connectionString: config.database.url });
  }
  return pool;
}

export async function initDatabase() {
  const db = getPool();
  if (!db) {
    console.warn('[db] DATABASE_URL not set — IV history and economic dedup disabled');
    return false;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS iv_alert_history (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(16) NOT NULL,
      iv_percentile NUMERIC(6,2) NOT NULL,
      alert_type VARCHAR(16) NOT NULL,
      alerted_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS economic_warnings_sent (
      id SERIAL PRIMARY KEY,
      event_key VARCHAR(128) NOT NULL UNIQUE,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS member_warnings (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      moderator_id VARCHAR(32) NOT NULL,
      reason TEXT,
      warned_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('[db] Schema ready');
  return true;
}

export async function query(text, params = []) {
  const db = getPool();
  if (!db) {
    throw new Error('Database not configured');
  }
  return db.query(text, params);
}
