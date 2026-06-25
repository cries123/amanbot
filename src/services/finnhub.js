import axios from 'axios';
import { config } from '../config.js';
import {
  normalizeCandles,
  findSwingHighs,
  findSwingLows,
  clusterSwingsByDollars,
  scanEqhEqlHistory,
} from '../utils/smcStructure.js';
import { getStockCandles, getCandleSourceLabel } from './candles.js';

const BASE = 'https://finnhub.io/api/v1';

function finnhubGet(path, params = {}) {
  if (!config.apis.finnhub) {
    throw new Error('FINNHUB_API_KEY is not configured');
  }
  return axios.get(`${BASE}${path}`, {
    params: { ...params, token: config.apis.finnhub },
    timeout: 20_000,
  });
}

const HIGH_IMPACT_KEYWORDS = [
  'cpi',
  'consumer price',
  'fomc',
  'federal funds rate',
  'fed interest rate',
  'non-farm',
  'nonfarm',
  'payroll',
  'jolts',
  'job openings',
  'jobless claims',
  'initial claims',
  'adp',
  'employment change',
];

export async function getEconomicCalendar(from, to) {
  const { data } = await finnhubGet('/calendar/economic', { from, to });
  return data?.economicCalendar ?? [];
}

export function filterHighImpactEvents(events) {
  return events
    .filter((e) => {
      const impact = String(e.impact ?? '').toLowerCase();
      const eventName = String(e.event ?? '').toLowerCase();
      const isHighImpact = impact === 'high' || impact === '3';
      const matchesKeyword = HIGH_IMPACT_KEYWORDS.some((kw) => eventName.includes(kw));
      const country = String(e.country ?? '').toUpperCase();
      const isUs = country === 'US' || country === 'USA' || country === '';
      return isUs && (isHighImpact || matchesKeyword);
    })
    .map(formatEvent);
}

export function formatEvent(event) {
  const time = event.time ? new Date(event.time) : null;
  return {
    event: event.event,
    impact: normalizeImpact(event.impact),
    country: event.country ?? 'US',
    time: time?.toISOString() ?? null,
    timeEt: time
      ? time.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })
      : 'TBD',
    estimate: event.estimate != null ? String(event.estimate) : null,
    previous: event.previous != null ? String(event.previous) : null,
    actual: event.actual != null ? String(event.actual) : null,
    eventKey: `${event.event}-${event.time}`,
  };
}

function normalizeImpact(impact) {
  const s = String(impact).toLowerCase();
  if (s === '3' || s === 'high') return 'high';
  if (s === '2' || s === 'medium') return 'medium';
  return 'low';
}

export function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    from: monday.toISOString().slice(0, 10),
    to: friday.toISOString().slice(0, 10),
  };
}

export function getUpcomingWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((8 - day) % 7 || 7));
  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);
  return {
    from: nextMonday.toISOString().slice(0, 10),
    to: nextFriday.toISOString().slice(0, 10),
  };
}

const CHART_RESOLUTION = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '60',
  '1D': 'D',
  '1d': 'D',
};

const RESOLUTION_SECONDS = {
  '1': 60,
  '5': 300,
  '15': 900,
  '60': 3600,
  D: 86_400,
};

const FLOW_TICKER_MAP = {
  SPX: 'SPY',
};

export function normalizeTicker(ticker) {
  const upper = ticker.toUpperCase().trim();
  return FLOW_TICKER_MAP[upper] ?? upper;
}

export function normalizeChartResolution(timeframe) {
  return CHART_RESOLUTION[timeframe] ?? timeframe;
}

function lookbackSeconds(resolution, bars = 120) {
  const seconds = RESOLUTION_SECONDS[resolution] ?? 86_400;
  return seconds * bars;
}

export { getStockCandles, getCandleSourceLabel };

export async function getQuote(symbol) {
  const { data } = await finnhubGet('/quote', { symbol: normalizeTicker(symbol) });
  return data;
}

export async function fetchChartImage(ticker, timeframe) {
  const symbol = normalizeTicker(ticker);
  const resolution = normalizeChartResolution(timeframe);
  const to = Math.floor(Date.now() / 1000);
  const from = to - lookbackSeconds(resolution);

  const candles = await getStockCandles(symbol, resolution, from, to);
  const buffer = await renderCandlestickChart(symbol, timeframe, candles);

  return { buffer, symbol, interval: timeframe, source: candles.source };
}

async function renderCandlestickChart(symbol, timeframe, candles) {
  const length = candles.t.length;
  const start = Math.max(0, length - 100);

  const points = [];
  for (let i = start; i < length; i++) {
    points.push({
      x: new Date(candles.t[i] * 1000).toISOString(),
      o: candles.o[i],
      h: candles.h[i],
      l: candles.l[i],
      c: candles.c[i],
    });
  }

  const chart = {
    type: 'candlestick',
    data: {
      datasets: [{
        label: symbol,
        data: points,
        color: { up: '#26a69a', down: '#ef5350', unchanged: '#999' },
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: `${symbol} — ${timeframe}`, color: '#ffffff' },
      },
      scales: {
        x: { ticks: { color: '#aaa', maxTicksLimit: 8 }, grid: { color: '#333' } },
        y: { ticks: { color: '#aaa' }, grid: { color: '#333' } },
      },
    },
  };

  const { data } = await axios.post(
    'https://quickchart.io/chart',
    {
      chart,
      width: 1200,
      height: 700,
      format: 'png',
      backgroundColor: '#0f0f1a',
    },
    { responseType: 'arraybuffer', timeout: 30_000 },
  );

  return Buffer.from(data);
}

export async function getIntradayCandles(symbol, resolution = '5', bars = 120) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - lookbackSeconds(resolution, bars);
  return getStockCandles(symbol, resolution, from, to);
}

const FLOW_RESOLUTION_MAP = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
};

export async function scanTickerSmcFlow(ticker, options = {}) {
  const symbol = normalizeTicker(ticker);
  const resolution = FLOW_RESOLUTION_MAP[options.timeframe] ?? '5';
  const toleranceDollars = options.toleranceDollars ?? options.tolerance ?? 0.05;
  const sweepsOnly = options.sweepsOnly ?? false;

  const raw = await getIntradayCandles(symbol, resolution, 150);
  const candles = normalizeCandles(raw);

  const swingHighs = findSwingHighs(candles);
  const swingLows = findSwingLows(candles);
  const eqhClusters = clusterSwingsByDollars(swingHighs, toleranceDollars);
  const eqlClusters = clusterSwingsByDollars(swingLows, toleranceDollars);

  let signals = scanEqhEqlHistory(candles, { toleranceDollars }).map((s) => ({
    ...s,
    underlying: symbol,
    timeframe: options.timeframe ?? '5m',
    dataSource: getCandleSourceLabel(raw),
    tolerance: toleranceDollars,
  }));

  if (sweepsOnly) {
    signals = signals.filter((s) => s.swept);
  }

  return {
    signals,
    diagnostics: {
      bars: candles.length,
      swingHighs: swingHighs.length,
      swingLows: swingLows.length,
      eqhClusters: eqhClusters.length,
      eqlClusters: eqlClusters.length,
    },
    symbol,
    timeframe: options.timeframe ?? '5m',
    dataSource: getCandleSourceLabel(raw),
  };
}

export async function estimateIvPercentile(ticker) {
  const symbol = normalizeTicker(ticker);
  const to = Math.floor(Date.now() / 1000);
  const from = to - 365 * 86_400;

  const daily = await getStockCandles(symbol, 'D', from, to);
  const len = daily.c?.length ?? 0;
  if (len < 30) return { ivPercentile: null, currentIv: null, ticker: symbol };

  const returns = [];
  for (let i = 1; i < len; i++) {
    returns.push(Math.log(daily.c[i] / daily.c[i - 1]));
  }

  const window = 20;
  const historicalVols = [];
  for (let i = window; i < returns.length; i++) {
    const slice = returns.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    historicalVols.push(Math.sqrt(variance * 252));
  }

  if (historicalVols.length === 0) {
    return { ivPercentile: null, currentIv: null, ticker: symbol };
  }

  const recentSlice = returns.slice(-window);
  const mean = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;
  const variance = recentSlice.reduce((a, b) => a + (b - mean) ** 2, 0) / recentSlice.length;
  const currentIv = Math.sqrt(variance * 252);

  const below = historicalVols.filter((hv) => hv <= currentIv).length;
  const ivPercentile = (below / historicalVols.length) * 100;

  return { ivPercentile, currentIv, ticker: symbol };
}
