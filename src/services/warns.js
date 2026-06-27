import { getPool, query } from '../database/db.js';

const memoryWarns = new Map();

function memoryKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export async function addWarning(guildId, userId, moderatorId, reason) {
  const db = getPool();
  if (db) {
    await query(
      'INSERT INTO member_warnings (guild_id, user_id, moderator_id, reason) VALUES ($1, $2, $3, $4)',
      [guildId, userId, moderatorId, reason],
    );
    const { rows } = await query(
      'SELECT COUNT(*)::int AS count FROM member_warnings WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId],
    );
    return rows[0].count;
  }

  const key = memoryKey(guildId, userId);
  const list = memoryWarns.get(key) ?? [];
  list.push({ moderatorId, reason, at: Date.now() });
  memoryWarns.set(key, list);
  return list.length;
}

export async function getWarningCount(guildId, userId) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS count FROM member_warnings WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId],
    );
    return rows[0].count;
  }

  return (memoryWarns.get(memoryKey(guildId, userId)) ?? []).length;
}

export async function clearWarnings(guildId, userId) {
  const db = getPool();
  if (db) {
    await query('DELETE FROM member_warnings WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
    return;
  }
  memoryWarns.delete(memoryKey(guildId, userId));
}

export async function getWarnings(guildId, userId) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      `SELECT moderator_id, reason, warned_at
       FROM member_warnings
       WHERE guild_id = $1 AND user_id = $2
       ORDER BY warned_at DESC`,
      [guildId, userId],
    );
    return rows;
  }

  return (memoryWarns.get(memoryKey(guildId, userId)) ?? []).map((w) => ({
    moderator_id: w.moderatorId,
    reason: w.reason,
    warned_at: new Date(w.at),
  }));
}
