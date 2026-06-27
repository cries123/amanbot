import { config } from '../config.js';
import {
  fetchScanCandles,
  dropFormingCandle,
  SMC_TICKERS,
  SMC_TIMEFRAMES,
  formatYahooError,
} from './yahooMarket.js';
import { scanRecentWickLevels } from '../utils/smcStructure.js';

export async function scanTickerWicks(ticker, overrides = {}) {
  const timeframe = overrides.timeframe ?? '1h';
  const tf = SMC_TIMEFRAMES[timeframe] ?? SMC_TIMEFRAMES['1h'];
  const data = await fetchScanCandles(ticker, timeframe, {
    scanDays: overrides.scanDays,
    sessionOnly: overrides.sessionOnly,
  });

  let candles = data.candles;
  if (overrides.live) {
    candles = dropFormingCandle(candles, tf.barMinutes);
  }

  const scanEnd = Math.min(data.scanEnd, candles.length - 1);
  const scan = scanRecentWickLevels(candles, {
    scanStart: data.scanStart,
    scanEnd,
    toleranceDollars: overrides.toleranceDollars ?? config.monitors.eqhEqlTolerance,
    minBarSeparation: overrides.minBarSeparation ?? tf.minBarSeparation,
    limit: overrides.limit ?? 3,
    withSweepDetection: overrides.withSweepDetection ?? false,
  });

  return {
    label: data.label,
    symbol: data.symbol,
    candles,
    eqh: scan.eqh,
    eql: scan.eql,
    signals: scan.signals,
    scanEnd,
    timeframe,
    tradingDate: data.tradingDate,
    sessionBars: data.sessionBars,
    mode: overrides.live ? 'live' : 'history',
  };
}

export async function scanTickerLive(ticker, overrides = {}) {
  return scanTickerWicks(ticker, { ...overrides, live: true });
}

export async function scanTickerHistory(ticker, overrides = {}) {
  return scanTickerWicks(ticker, overrides);
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

export async function scanAllTickersLive(timeframes = null, options = {}) {
  const frames = timeframes ?? getTimeframesDueNow();
  const results = [];

  for (const timeframe of frames) {
    for (const { label } of SMC_TICKERS) {
      try {
        results.push(await scanTickerWicks(label, {
          timeframe,
          live: true,
          withSweepDetection: options.withSweepDetection ?? false,
        }));
      } catch (err) {
        console.error(`[smc:${label}:${timeframe}]`, formatYahooError(err));
      }
    }
  }

  return results;
}

export { SMC_TICKERS, SMC_TIMEFRAMES };
