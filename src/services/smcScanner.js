import { config } from '../config.js';
import {
  fetchLiveCandles,
  fetchLastSessionCandles,
  dropFormingCandle,
  SMC_TICKERS,
  SMC_TIMEFRAMES,
  formatYahooError,
} from './yahooMarket.js';
import {
  scanLatestBar,
  scanAllSmc,
} from '../utils/smcStructure.js';

function scannerOptions(overrides = {}) {
  return {
    minGapPct: overrides.minGapPct ?? config.monitors.fvgMinGapPct,
    tolerancePct: overrides.tolerancePct ?? config.monitors.eqhEqlTolerancePct,
    structuresOnly: overrides.structuresOnly ?? false,
  };
}

function timeframeConfig(timeframe) {
  return SMC_TIMEFRAMES[timeframe] ?? SMC_TIMEFRAMES['5m'];
}

export async function scanTickerLive(ticker, overrides = {}) {
  const timeframe = overrides.timeframe ?? '5m';
  const tf = timeframeConfig(timeframe);
  const { label, symbol, candles: rawCandles } = await fetchLiveCandles(ticker, timeframe);
  const candles = dropFormingCandle(rawCandles, tf.barMinutes);
  const options = scannerOptions({ ...overrides, structuresOnly: tf.structuresOnly });
  const signals = scanLatestBar(candles, options);

  return {
    label,
    symbol,
    candles,
    signals,
    timeframe,
    options,
    mode: 'live',
  };
}

export async function scanTickerHistory(ticker, overrides = {}) {
  const timeframe = overrides.timeframe ?? '5m';
  const tf = timeframeConfig(timeframe);
  const { label, symbol, candles, tradingDate } = await fetchLastSessionCandles(ticker, timeframe);
  const options = scannerOptions({ ...overrides, structuresOnly: tf.structuresOnly });
  const signals = scanAllSmc(candles, options);

  return {
    label,
    symbol,
    candles,
    signals,
    tradingDate,
    timeframe,
    options,
    mode: 'history',
  };
}

export function getTimeframesDueNow(date = new Date()) {
  const et = new Date(date.toLocaleString('en-US', { timeZone: config.timezone }));
  const minute = et.getMinutes();
  const hour = et.getHours();
  const due = [];

  if ([1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56].includes(minute)) {
    due.push('5m');
  }

  if (minute === 1) {
    due.push('1h');
  }

  if (minute === 1 && [10, 14].includes(hour)) {
    due.push('4h');
  }

  return due.filter((tf) => config.monitors.smcTimeframes.includes(tf));
}

export async function scanAllTickersLive(timeframes = null) {
  const frames = timeframes ?? getTimeframesDueNow();
  const results = [];

  for (const timeframe of frames) {
    for (const { label } of SMC_TICKERS) {
      try {
        results.push(await scanTickerLive(label, { timeframe }));
      } catch (err) {
        console.error(`[smc:${label}:${timeframe}]`, formatYahooError(err));
      }
    }
  }

  return results;
}

export { SMC_TICKERS, SMC_TIMEFRAMES };
