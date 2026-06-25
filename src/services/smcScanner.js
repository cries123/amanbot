import { config } from '../config.js';
import { fetchLiveCandles, fetchLastSessionCandles, dropFormingCandle, SMC_TICKERS } from './yahooMarket.js';
import {
  scanLatestBar,
  scanAllSmc,
} from '../utils/smcStructure.js';

function scannerOptions(overrides = {}) {
  return {
    minGapPct: overrides.minGapPct ?? config.monitors.fvgMinGapPct,
    tolerancePct: overrides.tolerancePct ?? config.monitors.eqhEqlTolerancePct,
  };
}

export async function scanTickerLive(ticker, overrides = {}) {
  const { label, symbol, candles: rawCandles } = await fetchLiveCandles(ticker);
  const candles = dropFormingCandle(rawCandles);
  const options = scannerOptions(overrides);
  const signals = scanLatestBar(candles, options);

  return {
    label,
    symbol,
    candles,
    signals,
    options,
    mode: 'live',
  };
}

export async function scanTickerHistory(ticker, overrides = {}) {
  const { label, symbol, candles, tradingDate } = await fetchLastSessionCandles(ticker);
  const options = scannerOptions(overrides);
  const signals = scanAllSmc(candles, options);

  return {
    label,
    symbol,
    candles,
    signals,
    tradingDate,
    options,
    mode: 'history',
  };
}

export async function scanAllTickersLive() {
  const results = [];
  for (const { label } of SMC_TICKERS) {
    try {
      results.push(await scanTickerLive(label));
    } catch (err) {
      console.error(`[smc:${label}]`, err.message);
    }
  }
  return results;
}

export { SMC_TICKERS };
