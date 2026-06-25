/**
 * SMC detection engine — FVG, EQH, EQL
 * Candles format: { o, h, l, c, t, v }[]  (t = unix seconds)
 */

const SWING_LOOKBACK = 2;

export function normalizeCandles(raw) {
  if (Array.isArray(raw?.t)) {
    const len = raw.t.length;
    const candles = [];
    for (let i = 0; i < len; i++) {
      candles.push({
        t: raw.t[i],
        o: raw.o[i],
        h: raw.h[i],
        l: raw.l[i],
        c: raw.c[i],
        v: raw.v?.[i] ?? 0,
      });
    }
    return candles;
  }

  if (Array.isArray(raw)) {
    return raw.map((q) => ({
      t: q.t ?? Math.floor(new Date(q.date ?? q.timestamp).getTime() / 1000),
      o: q.o ?? q.open,
      h: q.h ?? q.high,
      l: q.l ?? q.low,
      c: q.c ?? q.close,
      v: q.v ?? q.volume ?? 0,
    })).filter((c) => c.o != null && c.h != null && c.l != null && c.c != null);
  }

  return [];
}

function percentSpread(minPrice, maxPrice) {
  const avg = (minPrice + maxPrice) / 2;
  if (avg === 0) return 0;
  return ((maxPrice - minPrice) / avg) * 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function findSwingHighs(candles, lookback = SWING_LOOKBACK) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].h <= candles[i - j].h || candles[i].h <= candles[i + j].h) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      swings.push({ price: candles[i].h, index: i, time: candles[i].t });
    }
  }
  return swings;
}

export function findSwingLows(candles, lookback = SWING_LOOKBACK) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].l >= candles[i - j].l || candles[i].l >= candles[i + j].l) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      swings.push({ price: candles[i].l, index: i, time: candles[i].t });
    }
  }
  return swings;
}

export function clusterSwingsByPercent(swings, tolerancePct) {
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < swings.length; i++) {
    if (used.has(i)) continue;
    const cluster = [swings[i]];
    used.add(i);

    for (let j = i + 1; j < swings.length; j++) {
      if (used.has(j)) continue;
      const prices = [...cluster.map((p) => p.price), swings[j].price];
      const spread = percentSpread(Math.min(...prices), Math.max(...prices));
      if (spread <= tolerancePct) {
        cluster.push(swings[j]);
        used.add(j);
      }
    }

    if (cluster.length >= 2) {
      const level = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      const minPrice = Math.min(...cluster.map((p) => p.price));
      const maxPrice = Math.max(...cluster.map((p) => p.price));
      clusters.push({
        level: round2(level),
        minPrice: round2(minPrice),
        maxPrice: round2(maxPrice),
        spreadPct: round2(percentSpread(minPrice, maxPrice)),
        touches: cluster.length,
        points: cluster,
        lastIndex: Math.max(...cluster.map((p) => p.index)),
      });
    }
  }

  return clusters;
}

export function detectFvgAt(candles, index, minGapPct) {
  if (index < 2) return null;

  const c1 = candles[index - 2];
  const c3 = candles[index];

  // Bullish FVG: candle 3 low > candle 1 high
  if (c3.l > c1.h) {
    const zoneLow = c1.h;
    const zoneHigh = c3.l;
    const gapPct = percentSpread(zoneLow, zoneHigh);
    if (gapPct >= minGapPct) {
      return {
        setupType: 'Bullish Fair Value Gap',
        type: 'BULL_FVG',
        direction: 'bullish',
        zoneLow: round2(zoneLow),
        zoneHigh: round2(zoneHigh),
        gapPct: round2(gapPct),
        price: round2(c3.c),
        barIndex: index,
        barTime: c3.t,
      };
    }
  }

  // Bearish FVG: candle 3 high < candle 1 low
  if (c3.h < c1.l) {
    const zoneLow = c3.h;
    const zoneHigh = c1.l;
    const gapPct = percentSpread(zoneLow, zoneHigh);
    if (gapPct >= minGapPct) {
      return {
        setupType: 'Bearish Fair Value Gap',
        type: 'BEAR_FVG',
        direction: 'bearish',
        zoneLow: round2(zoneLow),
        zoneHigh: round2(zoneHigh),
        gapPct: round2(gapPct),
        price: round2(c3.c),
        barIndex: index,
        barTime: c3.t,
      };
    }
  }

  return null;
}

export function scanFvgs(candles, minGapPct, { endIndex } = {}) {
  const signals = [];
  const last = endIndex ?? candles.length - 1;

  for (let i = 2; i <= last; i++) {
    const fvg = detectFvgAt(candles, i, minGapPct);
    if (fvg) signals.push(fvg);
  }

  return signals;
}

export function scanEqhEqlAt(candles, index, { tolerancePct = 0.05, lookback = SWING_LOOKBACK } = {}) {
  const slice = candles.slice(0, index + 1);
  if (slice.length < lookback * 2 + 3) return [];

  const swingHighs = findSwingHighs(slice, lookback);
  const swingLows = findSwingLows(slice, lookback);
  const eqhClusters = clusterSwingsByPercent(swingHighs, tolerancePct);
  const eqlClusters = clusterSwingsByPercent(swingLows, tolerancePct);

  const bar = candles[index];
  const signals = [];

  for (const cluster of eqhClusters) {
    const swept = bar.h > cluster.maxPrice;
    signals.push({
      setupType: swept ? 'EQH Sweep' : 'Equal Highs (EQH)',
      type: swept ? 'EQH_SWEEP' : 'EQH',
      direction: 'bearish',
      structure: 'EQH',
      level: cluster.level,
      zoneLow: cluster.minPrice,
      zoneHigh: cluster.maxPrice,
      spreadPct: cluster.spreadPct,
      touches: cluster.touches,
      formationIndex: cluster.lastIndex,
      price: round2(bar.c),
      swept,
      barIndex: index,
      barTime: bar.t,
    });
  }

  for (const cluster of eqlClusters) {
    const swept = bar.l < cluster.minPrice;
    signals.push({
      setupType: swept ? 'EQL Sweep' : 'Equal Lows (EQL)',
      type: swept ? 'EQL_SWEEP' : 'EQL',
      direction: 'bullish',
      structure: 'EQL',
      level: cluster.level,
      zoneLow: cluster.minPrice,
      zoneHigh: cluster.maxPrice,
      spreadPct: cluster.spreadPct,
      touches: cluster.touches,
      formationIndex: cluster.lastIndex,
      price: round2(bar.c),
      swept,
      barIndex: index,
      barTime: bar.t,
    });
  }

  return signals;
}

export function scanEqhEqlHistory(candles, { tolerancePct = 0.05, lookback = SWING_LOOKBACK } = {}) {
  const signals = [];
  for (let i = lookback * 2 + 1; i < candles.length; i++) {
    const barSignals = scanEqhEqlAt(candles, i, { tolerancePct, lookback });
    for (const sig of barSignals) {
      if (sig.barIndex === i) signals.push(sig);
    }
  }
  return dedupeStructureSignals(signals);
}

export function scanAllSmc(candles, { minGapPct = 0.02, tolerancePct = 0.05, endIndex, structuresOnly = false } = {}) {
  const last = endIndex ?? candles.length - 1;

  if (structuresOnly) {
    return scanEqhEqlHistory(candles.slice(0, last + 1), { tolerancePct })
      .filter((s) => s.barIndex <= last);
  }

  const fvgs = scanFvgs(candles, minGapPct, { endIndex: last });
  const structures = scanEqhEqlHistory(candles.slice(0, last + 1), { tolerancePct });
  return dedupeStructureSignals([...fvgs, ...structures.filter((s) => s.barIndex <= last)]);
}

export function scanLatestBar(candles, options) {
  if (candles.length < 3) return [];

  const lastIndex = candles.length - 1;
  const minGapPct = options.minGapPct ?? 0.02;
  const structuresOnly = options.structuresOnly ?? false;
  const structures = scanEqhEqlAt(candles, lastIndex, options);

  const signals = [];

  if (!structuresOnly) {
    const fvg = detectFvgAt(candles, lastIndex, minGapPct);
    if (fvg) signals.push(fvg);
  }

  for (const sig of structures) {
    if (sig.swept) {
      signals.push(sig);
    } else if ((sig.type === 'EQH' || sig.type === 'EQL') && sig.formationIndex === lastIndex) {
      signals.push(sig);
    }
  }

  return dedupeStructureSignals(signals);
}

function dedupeStructureSignals(signals) {
  const seen = new Set();
  return signals.filter((s) => {
    const key = `${s.type}-${s.barTime}-${s.zoneLow}-${s.zoneHigh}-${s.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Backward-compatible wrapper for older finnhub.js imports */
export function scanEqhEql(candles, { tolerance = 0.05, tolerancePct = tolerance } = {}) {
  const normalized = normalizeCandles(candles);
  const swingHighs = findSwingHighs(normalized);
  const swingLows = findSwingLows(normalized);
  const eqhClusters = clusterSwingsByPercent(swingHighs, tolerancePct);
  const eqlClusters = clusterSwingsByPercent(swingLows, tolerancePct);

  return {
    signals: scanEqhEqlHistory(normalized, { tolerancePct }),
    diagnostics: {
      bars: normalized.length,
      swingHighs: swingHighs.length,
      swingLows: swingLows.length,
      eqhClusters: eqhClusters.length,
      eqlClusters: eqlClusters.length,
    },
  };
}
