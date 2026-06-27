import { getPool, query } from '../database/db.js';
import { config } from '../config.js';
import { DEFAULT_TIMEZONE, isValidTimezone } from '../utils/time.js';

const memoryWatchlists = new Map();
const memoryAlertPrefs = new Map();

export const ALERT_TYPES = ['eqh', 'eql', 'fvg', 'volume'];
export const DELIVERY_MODES = ['dm', 'channel'];

export const TIMEZONE_OPTIONS = [
  { id: 'America/New_York', label: 'Eastern (ET)' },
  { id: 'America/Chicago', label: 'Central (CT)' },
  { id: 'America/Denver', label: 'Mountain (MT)' },
  { id: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { id: 'UTC', label: 'UTC' },
];

const DEFAULT_SETTINGS = {
  eqh: true,
  eql: true,
  fvg: true,
  volume: true,
  deliveryMode: 'dm',
  timezone: DEFAULT_TIMEZONE,
};

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

async function saveUserSettings(userId, settings) {
  const db = getPool();
  if (db) {
    await query(
      `INSERT INTO user_alert_prefs (user_id, eqh, eql, fvg, volume, delivery_mode, thread_id, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
       ON CONFLICT (user_id)
       DO UPDATE SET
         eqh = EXCLUDED.eqh,
         eql = EXCLUDED.eql,
         fvg = EXCLUDED.fvg,
         volume = EXCLUDED.volume,
         delivery_mode = EXCLUDED.delivery_mode,
         thread_id = NULL,
         timezone = EXCLUDED.timezone`,
      [userId, settings.eqh, settings.eql, settings.fvg, settings.volume, settings.deliveryMode, settings.timezone],
    );
    return settings;
  }

  memoryAlertPrefs.set(userId, { ...settings });
  return settings;
}

function rowToSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  const mode = row.delivery_mode === 'thread' ? 'channel' : (row.delivery_mode ?? 'dm');
  return {
    eqh: row.eqh,
    eql: row.eql,
    fvg: row.fvg,
    volume: row.volume,
    deliveryMode: DELIVERY_MODES.includes(mode) ? mode : 'dm',
    timezone: isValidTimezone(row.timezone) ? row.timezone : DEFAULT_TIMEZONE,
  };
}

export async function getUserSettings(userId) {
  const db = getPool();
  if (db) {
    const { rows } = await query(
      'SELECT eqh, eql, fvg, volume, delivery_mode, thread_id, timezone FROM user_alert_prefs WHERE user_id = $1',
      [userId],
    );
    if (!rows.length) return { ...DEFAULT_SETTINGS };
    return rowToSettings(rows[0]);
  }

  return { ...(memoryAlertPrefs.get(userId) ?? DEFAULT_SETTINGS) };
}

export async function getUserAlertPrefs(userId) {
  const settings = await getUserSettings(userId);
  return { eqh: settings.eqh, eql: settings.eql, fvg: settings.fvg, volume: settings.volume };
}

export async function setDeliveryMode(userId, mode) {
  if (!DELIVERY_MODES.includes(mode)) {
    throw new Error('Invalid delivery mode.');
  }

  const settings = await getUserSettings(userId);
  settings.deliveryMode = mode;
  return saveUserSettings(userId, settings);
}

export async function activateDmDelivery(userId) {
  return setDeliveryMode(userId, 'dm');
}

export async function activateChannelDelivery(userId) {
  if (!config.channels.watchlistAlerts) {
    throw new Error('Alerts channel is not set up yet. Ask an admin to configure CHANNEL_WATCHLIST_ALERTS.');
  }
  return setDeliveryMode(userId, 'channel');
}

export async function setUserTimezone(userId, timezone) {
  if (!isValidTimezone(timezone)) {
    throw new Error('Invalid timezone. Use an IANA name like America/Chicago or pick a preset.');
  }

  const settings = await getUserSettings(userId);
  settings.timezone = timezone;
  return saveUserSettings(userId, settings);
}

export async function toggleAlertPref(userId, alertType) {
  if (!ALERT_TYPES.includes(alertType)) {
    throw new Error('Invalid alert type.');
  }

  const settings = await getUserSettings(userId);
  settings[alertType] = !settings[alertType];
  return saveUserSettings(userId, settings);
}

export async function userWantsAlert(userId, alertType) {
  if (!alertType) return true;
  const settings = await getUserSettings(userId);
  return Boolean(settings[alertType]);
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
