import { getPool, query } from '../database/db.js';
import { config } from '../config.js';

const memoryWatchlists = new Map();

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
