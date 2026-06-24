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
    console.warn('[db] DATABASE_URL not set — sentiment polls and stats disabled');
    return false;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS sentiment_polls (
      id SERIAL PRIMARY KEY,
      poll_date DATE NOT NULL UNIQUE,
      message_id VARCHAR(32),
      market_result VARCHAR(8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sentiment_votes (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER NOT NULL REFERENCES sentiment_polls(id) ON DELETE CASCADE,
      user_id VARCHAR(32) NOT NULL,
      vote VARCHAR(8) NOT NULL CHECK (vote IN ('bullish', 'bearish')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (poll_id, user_id)
    );

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
