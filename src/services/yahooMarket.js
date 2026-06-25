import yahooFinance from 'yahoo-finance2';
import { normalizeCandles } from '../utils/smcStructure.js';

export const SMC_TICKERS = [
  { label: 'SPY', symbol: 'SPY' },
  { label: 'SPX', symbol: '^GSPC' },
  { label: 'QQQ', symbol: 'QQQ' },
];

const TICKER_MAP = Object.fromEntries(SMC_TICKERS.map((t) => [t.label, t.symbol]));

export function resolveSymbol(input) {
  const upper = input?.toUpperCase().trim();
  if (TICKER_MAP[upper]) return { label: upper, symbol: TICKER_MAP[upper] };
  if (upper === 'SPX' || upper === '^SPX' || upper === '^GSPC') return { label: 'SPX', symbol: '^GSPC' };
  return { label: upper, symbol: upper };
}

export async function fetchChartCandles(symbol, { interval = '5m', period1, period2 } = {}) {
  const chart = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval,
  });

  const quotes = chart?.quotes ?? [];
  const candles = normalizeCandles(
    quotes.map((q) => ({
      date: q.date,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
    })),
  );

  if (candles.length === 0) {
    throw new Error(`No ${interval} candle data returned for ${symbol}`);
  }

  return candles;
}

export async function fetchLiveCandles(ticker) {
  const { label, symbol } = resolveSymbol(ticker);
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - 5);

  const candles = await fetchChartCandles(symbol, {
    interval: '5m',
    period1,
    period2,
  });

  return { label, symbol, candles };
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

export async function fetchLastSessionCandles(ticker) {
  const { label, symbol } = resolveSymbol(ticker);
  const { tradingDate, period1, period2 } = getLastTradingSessionRange();

  const raw = await fetchChartCandles(symbol, {
    interval: '5m',
    period1,
    period2,
  });

  const candles = filterRegularSessionCandles(raw, tradingDate);
  if (candles.length === 0) {
    throw new Error(`No regular-session 5m candles for ${label} on ${tradingDate}`);
  }

  return { label, symbol, candles, tradingDate };
}
