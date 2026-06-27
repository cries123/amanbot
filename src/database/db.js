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
    console.warn('[db] DATABASE_URL not set — using in-memory storage (watchlists reset on restart)');
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

    CREATE TABLE IF NOT EXISTS user_watchlists (
      user_id VARCHAR(32) NOT NULL,
      ticker VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, ticker)
    );

    CREATE TABLE IF NOT EXISTS user_alerts (
      id SERIAL PRIMARY KEY,
      alert_key VARCHAR(160) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      dm_channel_id VARCHAR(32) NOT NULL,
      message_id VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (alert_key, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_alert_prefs (
      user_id VARCHAR(32) PRIMARY KEY,
      eqh BOOLEAN NOT NULL DEFAULT TRUE,
      eql BOOLEAN NOT NULL DEFAULT TRUE,
      fvg BOOLEAN NOT NULL DEFAULT TRUE,
      volume BOOLEAN NOT NULL DEFAULT TRUE,
      delivery_mode VARCHAR(16) NOT NULL DEFAULT 'dm',
      thread_id VARCHAR(32),
      timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York'
    );

    ALTER TABLE user_alert_prefs ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16) NOT NULL DEFAULT 'dm';
    ALTER TABLE user_alert_prefs ADD COLUMN IF NOT EXISTS thread_id VARCHAR(32);
    ALTER TABLE user_alert_prefs ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York';
  `);

  console.log('[db] Schema ready');
  return true;
}

export function isDatabaseConnected() {
  return Boolean(config.database.url && pool);
}

export function hasDatabaseUrl() {
  return Boolean(config.database.url);
}

export async function query(text, params = []) {
  const db = getPool();
  if (!db) {
    throw new Error('Database not configured');
  }
  return db.query(text, params);
}
