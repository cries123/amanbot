import { getPool, query } from '../database/db.js';

const memoryAlerts = new Map();

function memoryKey(alertKey, userId) {
  return `${alertKey}:${userId}`;
}

export async function saveUserAlert({ alertKey, userId, dmChannelId, messageId, status = 'active' }) {
  const db = getPool();
  if (db) {
    await query(
      `INSERT INTO user_alerts (alert_key, user_id, dm_channel_id, message_id, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (alert_key, user_id)
       DO UPDATE SET dm_channel_id = EXCLUDED.dm_channel_id, message_id = EXCLUDED.message_id, status = EXCLUDED.status`,
      [alertKey, userId, dmChannelId, messageId, status],
    );
    return;
  }

  memoryAlerts.set(memoryKey(alertKey, userId), { dmChannelId, messageId, status });
}

export async function getUserAlert(alertKey, userId) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT dm_channel_id, message_id, status FROM user_alerts WHERE alert_key = $1 AND user_id = $2',
      [alertKey, userId],
    );
    return rows[0] ?? null;
  }

  return memoryAlerts.get(memoryKey(alertKey, userId)) ?? null;
}

export async function getAlertsForKey(alertKey) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT user_id, dm_channel_id, message_id, status FROM user_alerts WHERE alert_key = $1',
      [alertKey],
    );
    return rows;
  }

  const results = [];
  for (const [key, value] of memoryAlerts) {
    if (key.startsWith(`${alertKey}:`)) {
      const userId = key.split(':').pop();
      results.push({ user_id: userId, dm_channel_id: value.dmChannelId, message_id: value.messageId, status: value.status });
    }
  }
  return results;
}

export async function updateAlertStatus(alertKey, status) {
  const db = getPool();
  if (db) {
    await query('UPDATE user_alerts SET status = $1 WHERE alert_key = $2', [status, alertKey]);
    return;
  }

  for (const [key, value] of memoryAlerts) {
    if (key.startsWith(`${alertKey}:`)) {
      value.status = status;
    }
  }
}

export function buildAlertKey(ticker, timeframe, signal) {
  const type = signal.type ?? signal.structure ?? 'ALERT';
  if (type === 'VOLUME_SPIKE' || signal.structure === 'VOLUME') {
    const bar = signal.barTime ?? signal.formationTime ?? signal.barIndex ?? 0;
    return `${ticker}-${timeframe}-${type}-${bar}`;
  }
  const low = signal.zoneLow?.toFixed?.(2) ?? '0';
  const high = signal.zoneHigh?.toFixed?.(2) ?? '0';
  return `${ticker}-${timeframe}-${type}-${low}-${high}`;
}
