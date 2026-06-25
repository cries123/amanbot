import axios from 'axios';
import { normalizeCandles } from '../utils/smcStructure.js';

export const SMC_TICKERS = [
  { label: 'SPY', symbol: 'SPY' },
  { label: 'SPX', symbol: '^GSPC' },
  { label: 'QQQ', symbol: 'QQQ' },
];

export const SMC_TIMEFRAMES = {
  '5m': { interval: '5m', barMinutes: 5, lookbackDays: 5, structuresOnly: false },
  '1h': { interval: '1h', barMinutes: 60, lookbackDays: 60, structuresOnly: true },
  '4h': { interval: '4h', barMinutes: 240, lookbackDays: 120, structuresOnly: true },
};

export const SMC_TIMEFRAME_LIST = Object.keys(SMC_TIMEFRAMES);

const TICKER_MAP = Object.fromEntries(SMC_TICKERS.map((t) => [t.label, t.symbol]));

const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 2_000;
const MAX_RETRIES = 4;

const cache = new Map();
let lastRequestAt = 0;
let requestChain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUnixSeconds(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return value;
}

function isRateLimitError(err) {
  const msg = String(err?.message ?? err).toLowerCase();
  return msg.includes('too many requests')
    || msg.includes('rate limit')
    || msg.includes('429')
    || msg.includes('not valid json');
}

function queueYahooRequest(task) {
  const run = requestChain.then(task, task);
  requestChain = run.catch(() => {});
  return run;
}

async function throttle() {
  const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export function resolveSymbol(input) {
  const upper = input?.toUpperCase().trim();
  if (TICKER_MAP[upper]) return { label: upper, symbol: TICKER_MAP[upper] };
  if (upper === 'SPX' || upper === '^SPX' || upper === '^GSPC') return { label: 'SPX', symbol: '^GSPC' };
  return { label: upper, symbol: upper };
}

async function fetchYahooChartDirect(symbol, { interval = '5m', period1, period2 }, hostIndex = 0) {
  const host = YAHOO_HOSTS[hostIndex] ?? YAHOO_HOSTS[0];
  const { data, status } = await axios.get(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    params: {
      interval,
      period1: toUnixSeconds(period1),
      period2: toUnixSeconds(period2),
      includePrePost: false,
    },
    headers: YAHOO_HEADERS,
    timeout: 25_000,
    validateStatus: () => true,
  });

  if (status === 429) {
    throw new Error('Yahoo Finance rate limit (429) — wait a minute and try again');
  }

  if (status >= 400) {
    throw new Error(`Yahoo Finance HTTP ${status}`);
  }

  const chartError = data?.chart?.error;
  if (chartError) {
    throw new Error(chartError.description ?? 'Yahoo Finance chart error');
  }

  const result = data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];

  if (!quote || timestamps.length === 0) {
    throw new Error(`No ${interval} candle data returned for ${symbol}`);
  }

  const candles = normalizeCandles(
    timestamps.map((t, i) => ({
      date: new Date(t * 1000),
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume?.[i] ?? 0,
    })).filter((q) => q.open != null && q.high != null && q.low != null && q.close != null),
  );

  if (candles.length === 0) {
    throw new Error(`No valid ${interval} candles for ${symbol}`);
  }

  return candles;
}

export async function fetchChartCandles(symbol, { interval = '5m', period1, period2 } = {}) {
  const cacheKey = `${symbol}|${interval}|${toUnixSeconds(period1)}|${toUnixSeconds(period2)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.candles;
  }

  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const candles = await queueYahooRequest(async () => {
        await throttle();

        try {
          return await fetchYahooChartDirect(symbol, { interval, period1, period2 }, 0);
        } catch (err) {
          if (isRateLimitError(err)) throw err;
          return fetchYahooChartDirect(symbol, { interval, period1, period2 }, 1);
        }
      });

      cache.set(cacheKey, { at: Date.now(), candles });
      return candles;
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === MAX_RETRIES - 1) break;
      await sleep(2_000 * 2 ** attempt);
    }
  }

  throw lastError;
}

export async function fetchLiveCandles(ticker, timeframe = '5m') {
  const { label, symbol } = resolveSymbol(ticker);
  const tf = SMC_TIMEFRAMES[timeframe] ?? SMC_TIMEFRAMES['5m'];
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - tf.lookbackDays);

  const candles = await fetchChartCandles(symbol, {
    interval: tf.interval,
    period1,
    period2,
  });

  return { label, symbol, candles, timeframe };
}

export function dropFormingCandle(candles, intervalMinutes = 5) {
  if (!candles.length) return candles;

  const last = candles[candles.length - 1];
  const barCloseMs = (last.t + intervalMinutes * 60) * 1000;
  if (Date.now() < barCloseMs) {
    return candles.slice(0, -1);
  }

  return candles;
}

function etParts(unixSeconds) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(unixSeconds * 1000));

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function filterRegularSessionCandles(candles, tradingDate) {
  return candles.filter((c) => {
    const { date, minutes } = etParts(c.t);
    return date === tradingDate && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  });
}

export function getLastTradingSessionRange() {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const cursor = new Date(etNow);

  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() - 1);
  }

  const minutes = cursor.getHours() * 60 + cursor.getMinutes();
  if (minutes < 9 * 60 + 30) {
    cursor.setDate(cursor.getDate() - 1);
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const tradingDate = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
  const period1 = new Date(cursor);
  period1.setDate(period1.getDate() - 1);
  const period2 = new Date(cursor);
  period2.setDate(period2.getDate() + 1);

  return { tradingDate, period1, period2 };
}

export async function fetchLastSessionCandles(ticker, timeframe = '5m') {
  const { label, symbol } = resolveSymbol(ticker);
  const tf = SMC_TIMEFRAMES[timeframe] ?? SMC_TIMEFRAMES['5m'];

  if (timeframe === '5m') {
    const { tradingDate, period1, period2 } = getLastTradingSessionRange();
    const raw = await fetchChartCandles(symbol, {
      interval: tf.interval,
      period1,
      period2,
    });

    const candles = filterRegularSessionCandles(raw, tradingDate);
    if (candles.length === 0) {
      throw new Error(`No regular-session 5m candles for ${label} on ${tradingDate}`);
    }

    return { label, symbol, candles, tradingDate, timeframe };
  }

  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - tf.lookbackDays);

  const candles = await fetchChartCandles(symbol, {
    interval: tf.interval,
    period1,
    period2,
  });

  const tradingDate = `last ${tf.lookbackDays}d`;
  return { label, symbol, candles, tradingDate, timeframe };
}

export function formatYahooError(err) {
  if (isRateLimitError(err)) {
    return 'Yahoo Finance rate limit — wait 60 seconds, then run `/smctest` on one ticker at a time.';
  }
  return err?.message ?? String(err);
}
