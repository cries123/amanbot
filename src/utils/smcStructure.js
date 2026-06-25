const DEFAULT_TOLERANCE = 0.05;
const DEFAULT_SWING_LOOKBACK = 2;

export function findSwingHighs(candles, lookback = DEFAULT_SWING_LOOKBACK) {
  const swings = [];
  const len = candles.h?.length ?? 0;

  for (let i = lookback; i < len - lookback; i++) {
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles.h[i] <= candles.h[i - j] || candles.h[i] <= candles.h[i + j]) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      swings.push({ price: candles.h[i], index: i, time: candles.t[i] });
    }
  }

  return swings;
}

export function findSwingLows(candles, lookback = DEFAULT_SWING_LOOKBACK) {
  const swings = [];
  const len = candles.l?.length ?? 0;

  for (let i = lookback; i < len - lookback; i++) {
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles.l[i] >= candles.l[i - j] || candles.l[i] >= candles.l[i + j]) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      swings.push({ price: candles.l[i], index: i, time: candles.t[i] });
    }
  }

  return swings;
}

export function clusterSwingPoints(swings, tolerance = DEFAULT_TOLERANCE) {
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < swings.length; i++) {
    if (used.has(i)) continue;

    const cluster = [swings[i]];
    used.add(i);

    for (let j = i + 1; j < swings.length; j++) {
      if (used.has(j)) continue;

      const prices = [...cluster.map((p) => p.price), swings[j].price];
      if (Math.max(...prices) - Math.min(...prices) <= tolerance) {
        cluster.push(swings[j]);
        used.add(j);
      }
    }

    if (cluster.length >= 2) {
      const level = cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length;
      const minPrice = Math.min(...cluster.map((p) => p.price));
      const maxPrice = Math.max(...cluster.map((p) => p.price));

      clusters.push({
        level: round2(level),
        touches: cluster.length,
        minPrice: round2(minPrice),
        maxPrice: round2(maxPrice),
        spread: round2(maxPrice - minPrice),
        points: cluster,
      });
    }
  }

  return clusters.sort((a, b) => b.touches - a.touches);
}

export function scanEqhEql(candles, { tolerance = DEFAULT_TOLERANCE, lookback = DEFAULT_SWING_LOOKBACK } = {}) {
  const len = candles.t?.length ?? 0;
  if (len < lookback * 2 + 3) {
    return { eqh: [], eql: [], signals: [], diagnostics: { bars: len, swingHighs: 0, swingLows: 0 } };
  }

  const swingHighs = findSwingHighs(candles, lookback);
  const swingLows = findSwingLows(candles, lookback);
  const eqh = clusterSwingPoints(swingHighs, tolerance);
  const eql = clusterSwingPoints(swingLows, tolerance);

  const lastIdx = len - 1;
  const lastHigh = candles.h[lastIdx];
  const lastLow = candles.l[lastIdx];
  const lastClose = candles.c[lastIdx];
  const lastTime = candles.t[lastIdx];

  const signals = [];

  for (const cluster of eqh) {
    const swept = lastHigh > cluster.level;
    signals.push({
      type: swept ? 'EQH_SWEEP' : 'EQH',
      structure: 'EQH',
      level: cluster.level,
      zoneLow: cluster.minPrice,
      zoneHigh: cluster.maxPrice,
      touches: cluster.touches,
      spread: cluster.spread,
      tolerance,
      price: lastClose,
      swept,
      barTime: new Date(lastTime * 1000).toISOString(),
    });
  }

  for (const cluster of eql) {
    const swept = lastLow < cluster.level;
    signals.push({
      type: swept ? 'EQL_SWEEP' : 'EQL',
      structure: 'EQL',
      level: cluster.level,
      zoneLow: cluster.minPrice,
      zoneHigh: cluster.maxPrice,
      touches: cluster.touches,
      spread: cluster.spread,
      tolerance,
      price: lastClose,
      swept,
      barTime: new Date(lastTime * 1000).toISOString(),
    });
  }

  return {
    eqh,
    eql,
    signals: signals.sort((a, b) => Number(b.swept) - Number(a.swept)),
    diagnostics: {
      bars: len,
      swingHighs: swingHighs.length,
      swingLows: swingLows.length,
      eqhClusters: eqh.length,
      eqlClusters: eql.length,
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
