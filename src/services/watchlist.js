import { getPool, query } from '../database/db.js';
import { config } from '../config.js';

const memoryWatchlists = new Map();
const memoryAlertPrefs = new Map();

export const ALERT_TYPES = ['eqh', 'eql', 'fvg', 'volume'];

const DEFAULT_PREFS = { eqh: true, eql: true, fvg: true, volume: true };

export function signalToAlertType(signal) {
  const s = signal.structure ?? signal.type ?? '';
  if (s === 'EQH') return 'eqh';
  if (s === 'EQL') return 'eql';
  if (s === 'FVG' || s === 'BULL_FVG' || s === 'BEAR_FVG') return 'fvg';
  if (s === 'VOLUME' || s === 'VOLUME_SPIKE') return 'volume';
  return null;
}

function normalizeTicker(ticker) {
  const upper = ticker?.toUpperCase().trim();
  if (upper === 'SPX' || upper === '^GSPC') return 'SPX';
  return upper;
}

export function isValidWatchlistTicker(ticker) {
  const t = normalizeTicker(ticker);
  return /^[A-Z^][A-Z0-9.\-]{0,9}$/.test(t);
}

export async function addToWatchlist(userId, ticker) {
  const symbol = normalizeTicker(ticker);
  if (!isValidWatchlistTicker(symbol)) {
    throw new Error('Invalid ticker symbol.');
  }

  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS count FROM user_watchlists WHERE user_id = $1',
      [userId],
    );
    if (rows[0].count >= config.watchlist.maxPerUser) {
      throw new Error(`Watchlist limit is ${config.watchlist.maxPerUser} tickers.`);
    }

    await query(
      'INSERT INTO user_watchlists (user_id, ticker) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, symbol],
    );
    return symbol;
  }

  const list = new Set(memoryWatchlists.get(userId) ?? []);
  if (list.size >= config.watchlist.maxPerUser && !list.has(symbol)) {
    throw new Error(`Watchlist limit is ${config.watchlist.maxPerUser} tickers.`);
  }
  list.add(symbol);
  memoryWatchlists.set(userId, list);
  return symbol;
}

export async function removeFromWatchlist(userId, ticker) {
  const symbol = normalizeTicker(ticker);
  const db = getPool();

  if (db) {
    await query('DELETE FROM user_watchlists WHERE user_id = $1 AND ticker = $2', [userId, symbol]);
    return symbol;
  }

  const list = memoryWatchlists.get(userId);
  list?.delete(symbol);
  return symbol;
}

export async function getUserWatchlist(userId) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT ticker FROM user_watchlists WHERE user_id = $1 ORDER BY ticker',
      [userId],
    );
    return rows.map((r) => r.ticker);
  }

  return [...(memoryWatchlists.get(userId) ?? [])].sort();
}

export async function getWatchersForTicker(ticker) {
  const symbol = normalizeTicker(ticker);
  const db = getPool();

  if (db) {
    const { rows } = await query(
      'SELECT user_id FROM user_watchlists WHERE ticker = $1',
      [symbol],
    );
    return rows.map((r) => r.user_id);
  }

  const watchers = [];
  for (const [userId, tickers] of memoryWatchlists) {
    if (tickers.has(symbol)) watchers.push(userId);
  }
  return watchers;
}

export async function getAllWatchedTickers() {
  const db = getPool();
  const base = new Set(config.monitors.smcTickers);

  if (db) {
    const { rows } = await query('SELECT DISTINCT ticker FROM user_watchlists');
    for (const row of rows) base.add(row.ticker);
    return [...base];
  }

  for (const tickers of memoryWatchlists.values()) {
    for (const t of tickers) base.add(t);
  }
  return [...base];
}

export async function getUserAlertPrefs(userId) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT eqh, eql, fvg, volume FROM user_alert_prefs WHERE user_id = $1',
      [userId],
    );
    if (!rows.length) return { ...DEFAULT_PREFS };
    return {
      eqh: rows[0].eqh,
      eql: rows[0].eql,
      fvg: rows[0].fvg,
      volume: rows[0].volume,
    };
  }

  return { ...(memoryAlertPrefs.get(userId) ?? DEFAULT_PREFS) };
}

export async function toggleAlertPref(userId, alertType) {
  if (!ALERT_TYPES.includes(alertType)) {
    throw new Error('Invalid alert type.');
  }

  const prefs = await getUserAlertPrefs(userId);
  prefs[alertType] = !prefs[alertType];

  const db = getPool();
  if (db) {
    await query(
      `INSERT INTO user_alert_prefs (user_id, eqh, eql, fvg, volume)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id)
       DO UPDATE SET eqh = EXCLUDED.eqh, eql = EXCLUDED.eql, fvg = EXCLUDED.fvg, volume = EXCLUDED.volume`,
      [userId, prefs.eqh, prefs.eql, prefs.fvg, prefs.volume],
    );
    return prefs;
  }

  memoryAlertPrefs.set(userId, prefs);
  return prefs;
}

export async function userWantsAlert(userId, alertType) {
  if (!alertType) return true;
  const prefs = await getUserAlertPrefs(userId);
  return Boolean(prefs[alertType]);
}

export async function getWatchersForTickerAlert(ticker, alertType) {
  const watchers = await getWatchersForTicker(ticker);
  const filtered = [];

  for (const userId of watchers) {
    if (await userWantsAlert(userId, alertType)) {
      filtered.push(userId);
    }
  }

  return filtered;
}
