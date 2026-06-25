import axios from 'axios';
import { config } from '../config.js';

const BASE = 'https://finnhub.io/api/v1';

const YAHOO_INTERVAL = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '60m',
  D: '1d',
};

const YAHOO_RANGE = {
  '1': '1d',
  '5': '5d',
  '15': '5d',
  '60': '1mo',
  D: '1y',
};

function finnhubGet(path, params = {}) {
  if (!config.apis.finnhub) {
    throw new Error('FINNHUB_API_KEY is not configured');
  }
  return axios.get(`${BASE}${path}`, {
    params: { ...params, token: config.apis.finnhub },
    timeout: 20_000,
    validateStatus: (status) => status < 500,
  });
}

function isFinnhubAccessDenied(response) {
  return response.status === 403
    || response.status === 401
    || String(response.data?.error ?? '').toLowerCase().includes('access');
}

async function getFinnhubCandles(symbol, resolution, from, to) {
  const response = await finnhubGet('/stock/candle', {
    symbol,
    resolution,
    from,
    to,
  });

  if (isFinnhubAccessDenied(response)) {
    const err = new Error('Finnhub candle data requires a paid Market Data plan on your API key.');
    err.code = 'FINNHUB_CANDLE_DENIED';
    err.status = response.status;
    throw err;
  }

  if (response.status !== 200 || response.data.s !== 'ok') {
    throw new Error(`No Finnhub candle data for ${symbol} (${resolution})`);
  }

  return { ...response.data, source: 'finnhub' };
}

async function getYahooCandles(symbol, resolution, from, to) {
  const interval = YAHOO_INTERVAL[resolution] ?? '5m';

  const { data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    params: {
      interval,
      period1: from,
      period2: to,
      includePrePost: false,
    },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AmanBot/1.0)' },
    timeout: 20_000,
  });

  const result = data.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];

  if (!quote || timestamps.length === 0) {
    throw new Error(`No Yahoo candle data for ${symbol} (${resolution})`);
  }

  const candles = { t: [], o: [], h: [], l: [], c: [], v: [], source: 'yahoo' };

  for (let i = 0; i < timestamps.length; i++) {
    if (quote.open[i] == null || quote.close[i] == null) continue;
    candles.t.push(timestamps[i]);
    candles.o.push(quote.open[i]);
    candles.h.push(quote.high[i]);
    candles.l.push(quote.low[i]);
    candles.c.push(quote.close[i]);
    candles.v.push(quote.volume[i] ?? 0);
  }

  if (candles.t.length === 0) {
    throw new Error(`No valid Yahoo candles for ${symbol}`);
  }

  return candles;
}

export async function getStockCandles(symbol, resolution, from, to) {
  try {
    return await getFinnhubCandles(symbol, resolution, from, to);
  } catch (err) {
    if (err.code === 'FINNHUB_CANDLE_DENIED' || err.status === 403) {
      console.warn(`[candles] Finnhub denied ${symbol} — falling back to Yahoo Finance`);
      try {
        return await getYahooCandles(symbol, resolution, from, to);
      } catch (yahooErr) {
        throw new Error(
          `${err.message} Yahoo fallback also failed: ${yahooErr.message}`,
        );
      }
    }
    throw err;
  }
}

export function getCandleSourceLabel(candles) {
  return candles.source === 'yahoo'
    ? 'Yahoo Finance (Finnhub free plan has no candle access)'
    : 'Finnhub';
}
