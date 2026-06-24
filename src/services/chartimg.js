import axios from 'axios';
import { config } from '../config.js';

const TIMEFRAME_MAP = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '1H': '1h',
  '2h': '2h',
  '4h': '4h',
  '1d': '1D',
  '1D': '1D',
  '1w': '1W',
  '1W': '1W',
};

export function normalizeTimeframe(tf) {
  return TIMEFRAME_MAP[tf] ?? tf;
}

export function normalizeSymbol(ticker) {
  const upper = ticker.toUpperCase().trim();
  if (upper.includes(':')) return upper;
  return `NASDAQ:${upper}`;
}

export async function fetchChartImage(ticker, timeframe, options = {}) {
  if (!config.apis.chartImg) {
    throw new Error('CHART_IMG_API_KEY is not configured');
  }

  const symbol = normalizeSymbol(ticker);
  const interval = normalizeTimeframe(timeframe);

  const headers = {
    'x-api-key': config.apis.chartImg,
    'content-type': 'application/json',
  };

  if (config.tradingview.sessionId) {
    headers['tradingview-session-id'] = config.tradingview.sessionId;
    headers['tradingview-session-id-sign'] = config.tradingview.sessionIdSign;
  }

  const body = {
    symbol,
    interval,
    theme: options.theme ?? 'dark',
    width: options.width ?? 1200,
    height: options.height ?? 700,
    style: 'candle',
    studies: options.studies ?? ['Volume@tv-basicstudies'],
  };

  const response = await axios.post(
    'https://api.chart-img.com/v2/tradingview/advanced-chart/storage',
    body,
    { headers, timeout: 30_000 },
  );

  const url = response.data?.url ?? response.data?.imageUrl;
  if (!url) {
    const imageResponse = await axios.post(
      'https://api.chart-img.com/v2/tradingview/advanced-chart',
      body,
      { headers, responseType: 'arraybuffer', timeout: 30_000 },
    );
    return { buffer: Buffer.from(imageResponse.data), symbol, interval };
  }

  const imageResponse = await axios.get(url, { responseType: 'arraybuffer', timeout: 30_000 });
  return { buffer: Buffer.from(imageResponse.data), symbol, interval, url };
}
