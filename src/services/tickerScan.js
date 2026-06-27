import { config } from '../config.js';
import { fetchScanCandles, dropFormingCandle, SMC_TIMEFRAMES } from './yahooMarket.js';
import { scanRecentWickLevels, detectFvgAt, scanFvgs } from '../utils/smcStructure.js';

function avgVolume(candles, end, lookback = 20) {
  const start = Math.max(0, end - lookback + 1);
  const slice = candles.slice(start, end + 1);
  if (!slice.length) return 0;
  return slice.reduce((s, c) => s + (c.v ?? 0), 0) / slice.length;
}

function detectVolumeSpike(candles, end, multiplier = 2.5) {
  if (end < 20) return null;
  const bar = candles[end];
  const avg = avgVolume(candles, end - 1, 20);
  if (!avg || !bar.v) return null;
  const ratio = bar.v / avg;
  if (ratio < multiplier) return null;

  const direction = bar.c >= bar.o ? 'bullish' : 'bearish';
  return {
    type: 'VOLUME_SPIKE',
    structure: 'VOLUME',
    setupType: `Unusual Volume (${direction})`,
    direction,
    volume: bar.v,
    avgVolume: Math.round(avg),
    volRatio: Math.round(ratio * 10) / 10,
    price: bar.c,
    barIndex: end,
    barTime: bar.t,
    formationIndex: end,
    formationTime: bar.t,
    swept: false,
    invalidated: false,
  };
}

function enrichFvg(fvg, candles, end) {
  const bar = candles[end];
  let swept = false;
  let invalidated = false;

  if (fvg.type === 'BULL_FVG') {
    invalidated = bar.l <= fvg.zoneLow;
  } else if (fvg.type === 'BEAR_FVG') {
    invalidated = bar.h >= fvg.zoneHigh;
  }

  return {
    ...fvg,
    structure: 'FVG',
    formationIndex: fvg.barIndex,
    formationTime: fvg.barTime,
    swept: invalidated,
    invalidated,
    tolerance: config.monitors.fvgMinGapPct,
    touches: 1,
  };
}

export async function scanTickerAlerts(ticker, timeframe = '5m') {
  const tf = SMC_TIMEFRAMES[timeframe] ?? SMC_TIMEFRAMES['5m'];
  const data = await fetchScanCandles(ticker, timeframe);
  let candles = dropFormingCandle(data.candles, tf.barMinutes);
  const scanEnd = Math.min(data.scanEnd, candles.length - 1);

  const wickScan = scanRecentWickLevels(candles, {
    scanStart: data.scanStart,
    scanEnd,
    toleranceDollars: config.monitors.eqhEqlTolerance,
    minBarSeparation: tf.minBarSeparation,
    minPairSeparation: tf.minPairSeparation,
    lookback: tf.swingLookback,
    limit: 3,
    withSweepDetection: true,
  });

  const signals = [...wickScan.signals];

  const latestFvg = detectFvgAt(candles, scanEnd, config.monitors.fvgMinGapPct);
  if (latestFvg && latestFvg.barIndex === scanEnd) {
    signals.push(enrichFvg(latestFvg, candles, scanEnd));
  }

  const volume = detectVolumeSpike(candles, scanEnd, config.monitors.volumeSpikeRatio);
  if (volume) signals.push(volume);

  return {
    label: data.label,
    symbol: data.symbol,
    timeframe,
    scanEnd,
    tradingDate: data.tradingDate,
    signals,
  };
}

export async function rescanSignalState(ticker, timeframe, signal) {
  const result = await scanTickerAlerts(ticker, timeframe);
  const type = signal.type ?? signal.structure;
  const match = result.signals.find((s) => {
    if (s.type !== type && s.structure !== signal.structure) return false;
    if (signal.zoneLow != null) return Math.abs(s.zoneLow - signal.zoneLow) < 0.02;
    return s.barIndex === signal.barIndex || s.formationIndex === signal.formationIndex;
  });
  return match ?? { ...signal, swept: true, invalidated: true };
}
