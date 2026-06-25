/**
 * SMC detection engine — FVG, EQH, EQL
 * Candles format: { o, h, l, c, t, v }[]  (t = unix seconds)
 */

const DEFAULT_SWING_LOOKBACK = 2;

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

export function findSwingHighs(candles, lookback = DEFAULT_SWING_LOOKBACK) {
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

export function findSwingLows(candles, lookback = DEFAULT_SWING_LOOKBACK) {
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

export function clusterSwingsByDollars(swings, toleranceDollars) {
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < swings.length; i++) {
    if (used.has(i)) continue;
    const cluster = [swings[i]];
    used.add(i);

    for (let j = i + 1; j < swings.length; j++) {
      if (used.has(j)) continue;
      if (swings[i].index === swings[j].index) continue;
      const prices = [...cluster.map((p) => p.price), swings[j].price];
      const spread = Math.max(...prices) - Math.min(...prices);
      if (spread <= toleranceDollars) {
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
        spread: round2(maxPrice - minPrice),
        spreadPct: round2(percentSpread(minPrice, maxPrice)),
        touches: cluster.length,
        points: cluster,
        lastIndex: Math.max(...cluster.map((p) => p.index)),
        firstIndex: Math.min(...cluster.map((p) => p.index)),
      });
    }
  }

  return clusters;
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
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      if (percentSpread(minPrice, maxPrice) <= tolerancePct) {
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
        spread: round2(maxPrice - minPrice),
        spreadPct: round2(percentSpread(minPrice, maxPrice)),
        touches: cluster.length,
        points: cluster,
        lastIndex: Math.max(...cluster.map((p) => p.index)),
        firstIndex: Math.min(...cluster.map((p) => p.index)),
      });
    }
  }

  return clusters;
}

function buildStructureSignal(cluster, structure, candles, endIndex, toleranceDollars) {
  const isEqh = structure === 'EQH';
  let swept = false;
  let signalIndex = cluster.lastIndex;
  let signalTime = candles[cluster.lastIndex].t;

  for (let i = cluster.lastIndex + 1; i <= endIndex; i++) {
    const bar = candles[i];
    if (isEqh ? bar.h > cluster.maxPrice : bar.l < cluster.minPrice) {
      swept = true;
      signalIndex = i;
      signalTime = bar.t;
      break;
    }
  }

  const bar = candles[signalIndex];

  const formationTime = cluster.points[cluster.points.length - 1]?.time ?? candles[cluster.lastIndex].t;

  return {
    setupType: swept
      ? (isEqh ? 'EQH Sweep' : 'EQL Sweep')
      : (isEqh ? 'Equal Highs (EQH)' : 'Equal Lows (EQL)'),
    type: swept ? (isEqh ? 'EQH_SWEEP' : 'EQL_SWEEP') : structure,
    direction: isEqh ? 'bearish' : 'bullish',
    structure,
    level: cluster.level,
    zoneLow: cluster.minPrice,
    zoneHigh: cluster.maxPrice,
    spread: cluster.spread,
    spreadPct: cluster.spreadPct,
    tolerance: toleranceDollars,
    touches: cluster.touches,
    formationIndex: cluster.lastIndex,
    formationTime,
    touchTimes: cluster.points.map((p) => p.time),
    price: round2(bar.c),
    swept,
    barIndex: signalIndex,
    barTime: signalTime,
  };
}

function findPairClusters(candles, sessionStart, sessionEnd, structure, toleranceDollars, minBarSeparation) {
  const clusters = [];
  const isEqh = structure === 'EQH';
  const points = [];

  for (let i = sessionStart; i <= sessionEnd; i++) {
    points.push({
      price: isEqh ? candles[i].h : candles[i].l,
      index: i,
      time: candles[i].t,
    });
  }

  const usedPairs = new Set();

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[j].index - points[i].index < minBarSeparation) continue;
      const spread = Math.abs(points[i].price - points[j].price);
      if (spread > toleranceDollars) continue;

      const key = `${points[i].index}-${points[j].index}`;
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);

      const pair = [points[i], points[j]];
      const minPrice = Math.min(...pair.map((p) => p.price));
      const maxPrice = Math.max(...pair.map((p) => p.price));
      clusters.push({
        level: round2((minPrice + maxPrice) / 2),
        minPrice: round2(minPrice),
        maxPrice: round2(maxPrice),
        spread: round2(maxPrice - minPrice),
        spreadPct: round2(percentSpread(minPrice, maxPrice)),
        touches: 2,
        points: pair,
        lastIndex: Math.max(...pair.map((p) => p.index)),
        firstIndex: Math.min(...pair.map((p) => p.index)),
      });
    }
  }

  return clusters;
}

function findSessionExtremeClusters(candles, sessionStart, sessionEnd, structure, bandDollars) {
  const isEqh = structure === 'EQH';
  const points = [];

  for (let i = sessionStart; i <= sessionEnd; i++) {
    points.push({
      price: isEqh ? candles[i].h : candles[i].l,
      index: i,
      time: candles[i].t,
    });
  }

  if (points.length < 2) return [];

  const extreme = isEqh
    ? Math.max(...points.map((p) => p.price))
    : Math.min(...points.map((p) => p.price));

  const nearExtreme = points.filter((p) =>
    isEqh ? extreme - p.price <= bandDollars : p.price - extreme <= bandDollars,
  );

  const indices = new Set(nearExtreme.map((p) => p.index));
  if (indices.size < 2) return [];

  const minPrice = Math.min(...nearExtreme.map((p) => p.price));
  const maxPrice = Math.max(...nearExtreme.map((p) => p.price));

  return [{
    level: round2((minPrice + maxPrice) / 2),
    minPrice: round2(minPrice),
    maxPrice: round2(maxPrice),
    spread: round2(maxPrice - minPrice),
    spreadPct: round2(percentSpread(minPrice, maxPrice)),
    touches: nearExtreme.length,
    points: nearExtreme,
    lastIndex: Math.max(...nearExtreme.map((p) => p.index)),
    firstIndex: Math.min(...nearExtreme.map((p) => p.index)),
    sessionExtreme: true,
  }];
}

function mergeClusters(...clusterGroups) {
  const all = clusterGroups.flat();
  const merged = [];

  for (const cluster of all) {
    const duplicate = merged.find((existing) => {
      const overlap = cluster.points.some((p) =>
        existing.points.some((e) => e.index === p.index),
      );
      const sameZone = Math.abs(existing.level - cluster.level) <= 0.06;
      return overlap || sameZone;
    });

    if (!duplicate) {
      merged.push(cluster);
    }
  }

  return merged;
}

export function rankStructureSignals(signals, structure = 'EQL') {
  const isEqh = structure === 'EQH';
  return [...signals].sort((a, b) => {
    if (isEqh) return b.level - a.level;
    return a.level - b.level;
  });
}

export function clusterWickLevels(points, toleranceDollars, minBarSeparation = 1) {
  const clusters = clusterSwingsByDollars(points, toleranceDollars);

  return clusters
    .filter((cluster) => {
      const indices = [...new Set(cluster.points.map((p) => p.index))];
      if (indices.length < 2) return false;
      indices.sort((a, b) => a - b);
      return indices[indices.length - 1] - indices[0] >= minBarSeparation;
    })
    .map((cluster) => ({
      ...cluster,
      lastTime: Math.max(...cluster.points.map((p) => p.time)),
      firstTime: Math.min(...cluster.points.map((p) => p.time)),
    }));
}

export function scanRecentWickLevels(candles, {
  scanStart = 0,
  scanEnd,
  toleranceDollars = 0.05,
  minBarSeparation = 1,
  limit = 3,
} = {}) {
  const end = scanEnd ?? candles.length - 1;
  if (end < scanStart) return { eqh: [], eql: [], signals: [] };

  const highWicks = [];
  const lowWicks = [];

  for (let i = scanStart; i <= end; i++) {
    highWicks.push({ price: candles[i].h, index: i, time: candles[i].t });
    lowWicks.push({ price: candles[i].l, index: i, time: candles[i].t });
  }

  const toLevel = (cluster, structure) => ({
    setupType: structure === 'EQH' ? 'Equal Highs (EQH)' : 'Equal Lows (EQL)',
    type: structure,
    structure,
    direction: structure === 'EQH' ? 'bearish' : 'bullish',
    level: cluster.level,
    zoneLow: cluster.minPrice,
    zoneHigh: cluster.maxPrice,
    spread: cluster.spread,
    tolerance: toleranceDollars,
    touches: cluster.touches,
    formationTime: cluster.lastTime,
    touchTimes: cluster.points.map((p) => p.time),
  });

  const eqh = clusterWickLevels(highWicks, toleranceDollars, minBarSeparation)
    .sort((a, b) => b.lastTime - a.lastTime)
    .slice(0, limit)
    .map((cluster) => toLevel(cluster, 'EQH'));

  const eql = clusterWickLevels(lowWicks, toleranceDollars, minBarSeparation)
    .sort((a, b) => b.lastTime - a.lastTime)
    .slice(0, limit)
    .map((cluster) => toLevel(cluster, 'EQL'));

  return { eqh, eql, signals: [...eqh, ...eql] };
}

export function scanSessionEqhEql(candles, {
  sessionStart = 0,
  sessionEnd,
  toleranceDollars = 0.05,
  sessionExtremeBand = 0.4,
  lookback = 2,
  minBarSeparation = 3,
} = {}) {
  const end = sessionEnd ?? candles.length - 1;
  if (end < sessionStart || candles.length < 2) return [];

  const swingHighs = findSwingHighs(candles, lookback)
    .filter((s) => s.index >= sessionStart && s.index <= end);
  const swingLows = findSwingLows(candles, lookback)
    .filter((s) => s.index >= sessionStart && s.index <= end);

  const eqhClusters = mergeClusters(
    clusterSwingsByDollars(swingHighs, toleranceDollars),
    findPairClusters(candles, sessionStart, end, 'EQH', toleranceDollars, minBarSeparation),
    findSessionExtremeClusters(candles, sessionStart, end, 'EQH', sessionExtremeBand),
  );

  const eqlClusters = mergeClusters(
    clusterSwingsByDollars(swingLows, toleranceDollars),
    findPairClusters(candles, sessionStart, end, 'EQL', toleranceDollars, minBarSeparation),
    findSessionExtremeClusters(candles, sessionStart, end, 'EQL', sessionExtremeBand),
  );

  const signals = [
    ...eqhClusters.map((cluster) => buildStructureSignal(cluster, 'EQH', candles, end, toleranceDollars)),
    ...eqlClusters.map((cluster) => buildStructureSignal(cluster, 'EQL', candles, end, toleranceDollars)),
  ];

  return dedupeStructureSignals(signals);
}

export function detectFvgAt(candles, index, minGapPct) {
  if (index < 2) return null;

  const c1 = candles[index - 2];
  const c3 = candles[index];

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

export function scanEqhEqlAt(candles, index, { toleranceDollars = 0.05, lookback = DEFAULT_SWING_LOOKBACK } = {}) {
  const slice = candles.slice(0, index + 1);
  if (slice.length < lookback * 2 + 1) return [];

  const swingHighs = findSwingHighs(slice, lookback);
  const swingLows = findSwingLows(slice, lookback);
  const eqhClusters = clusterSwingsByDollars(swingHighs, toleranceDollars);
  const eqlClusters = clusterSwingsByDollars(swingLows, toleranceDollars);

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
      spread: cluster.spread,
      spreadPct: cluster.spreadPct,
      tolerance: toleranceDollars,
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
      spread: cluster.spread,
      spreadPct: cluster.spreadPct,
      tolerance: toleranceDollars,
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

export function scanEqhEqlHistory(candles, { toleranceDollars = 0.05, lookback = DEFAULT_SWING_LOOKBACK } = {}) {
  const signals = [];
  for (let i = lookback * 2; i < candles.length; i++) {
    const barSignals = scanEqhEqlAt(candles, i, { toleranceDollars, lookback });
    for (const sig of barSignals) {
      if (sig.barIndex === i) signals.push(sig);
    }
  }
  return dedupeStructureSignals(signals);
}

export function scanAllSmc(candles, {
  minGapPct = 0.02,
  toleranceDollars = 0.05,
  sessionExtremeBand = 0.4,
  minBarSeparation = 3,
  endIndex,
  structuresOnly = false,
  lookback = DEFAULT_SWING_LOOKBACK,
  sessionStart,
  sessionEnd,
} = {}) {
  const last = endIndex ?? candles.length - 1;

  if (sessionStart != null) {
    return scanSessionEqhEql(candles, {
      sessionStart,
      sessionEnd: last,
      toleranceDollars,
      sessionExtremeBand,
      lookback,
      minBarSeparation,
    });
  }

  if (structuresOnly) {
    return scanEqhEqlHistory(candles.slice(0, last + 1), { toleranceDollars, lookback })
      .filter((s) => s.barIndex <= last);
  }

  const fvgs = scanFvgs(candles, minGapPct, { endIndex: last });
  const structures = scanEqhEqlHistory(candles.slice(0, last + 1), { toleranceDollars, lookback });
  return dedupeStructureSignals([...fvgs, ...structures.filter((s) => s.barIndex <= last)]);
}

export function scanLatestBar(candles, options) {
  if (candles.length < 3) return [];

  const lastIndex = candles.length - 1;
  const minGapPct = options.minGapPct ?? 0.02;
  const structuresOnly = options.structuresOnly ?? false;

  if (options.sessionStart != null) {
    return scanSessionEqhEql(candles, {
      sessionStart: options.sessionStart,
      sessionEnd: lastIndex,
      toleranceDollars: options.toleranceDollars ?? 0.05,
      lookback: options.lookback ?? 1,
    }).filter((sig) => sig.swept || sig.formationIndex === lastIndex);
  }

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
    const key = `${s.type}-${s.zoneLow}-${s.zoneHigh}-${s.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Backward-compatible wrapper for older finnhub.js imports */
export function scanEqhEql(candles, { tolerance = 0.05, toleranceDollars = tolerance } = {}) {
  const normalized = normalizeCandles(candles);
  const swingHighs = findSwingHighs(normalized);
  const swingLows = findSwingLows(normalized);
  const eqhClusters = clusterSwingsByDollars(swingHighs, toleranceDollars);
  const eqlClusters = clusterSwingsByDollars(swingLows, toleranceDollars);

  return {
    signals: scanEqhEqlHistory(normalized, { toleranceDollars }),
    diagnostics: {
      bars: normalized.length,
      swingHighs: swingHighs.length,
      swingLows: swingLows.length,
      eqhClusters: eqhClusters.length,
      eqlClusters: eqlClusters.length,
    },
  };
}
