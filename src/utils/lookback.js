export const TIMEFRAMES = ['5m', '1h', '4h'];

export const DEFAULT_LOOKBACK_DAYS = {
  '5m': 1,
  '1h': 7,
  '4h': 14,
};

export const MAX_LOOKBACK_DAYS = {
  '5m': 10,
  '1h': 90,
  '4h': 180,
};

export const LOOKBACK_PRESETS = {
  '5m': [
    { days: 1, label: '1 day' },
    { days: 2, label: '2 days' },
    { days: 5, label: '5 days' },
  ],
  '1h': [
    { days: 7, label: '1 week' },
    { days: 14, label: '2 weeks' },
    { days: 30, label: '1 month' },
    { days: 60, label: '2 months' },
  ],
  '4h': [
    { days: 14, label: '2 weeks' },
    { days: 30, label: '1 month' },
    { days: 60, label: '2 months' },
    { days: 90, label: '3 months' },
  ],
};

export function isValidTimeframe(tf) {
  return TIMEFRAMES.includes(tf);
}

export function clampLookbackDays(timeframe, days) {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('Lookback must be at least 1 day.');
  }
  const max = MAX_LOOKBACK_DAYS[timeframe] ?? 90;
  if (n > max) {
    throw new Error(`Max lookback for ${timeframe} is ${max} days.`);
  }
  return n;
}

export function formatLookbackLabel(days, timeframe) {
  if (timeframe === '5m' && days <= 1) return 'today (regular session)';
  if (days === 7) return 'past 7 days';
  if (days === 14) return 'past 14 days';
  if (days === 30) return 'past 1 month';
  if (days === 60) return 'past 2 months';
  if (days === 90) return 'past 3 months';
  return `past ${days} days`;
}

export function defaultLookbackSettings() {
  return { ...DEFAULT_LOOKBACK_DAYS };
}
