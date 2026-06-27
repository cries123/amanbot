import { finnhubGet, getWeekRange, normalizeTicker } from './finnhub.js';

function formatEarningsHour(hour) {
  const map = {
    amc: 'After Market Close',
    bmo: 'Before Market Open',
    dmh: 'During Market Hours',
  };
  return map[String(hour ?? '').toLowerCase()] ?? (hour || 'TBD');
}

function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  if (Math.abs(num) >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  return `$${num.toFixed(2)}`;
}

export function formatEarningsEntry(entry) {
  return {
    symbol: entry.symbol?.toUpperCase(),
    date: entry.date,
    hour: formatEarningsHour(entry.hour),
    quarter: entry.quarter,
    year: entry.year,
    epsEstimate: entry.epsEstimate,
    epsActual: entry.epsActual,
    revenueEstimate: entry.revenueEstimate,
    revenueActual: entry.revenueActual,
    eventKey: `${entry.symbol}-${entry.date}-${entry.quarter ?? 0}-${entry.year ?? 0}`,
  };
}

export async function getEarningsCalendar(from, to, symbol = null) {
  const params = { from, to };
  if (symbol) params.symbol = normalizeTicker(symbol);
  const { data } = await finnhubGet('/calendar/earnings', params);
  return (data?.earningsCalendar ?? []).map(formatEarningsEntry);
}

export async function getTickerEarnings(ticker, { daysAhead = 90 } = {}) {
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + daysAhead);
  const to = toDate.toISOString().slice(0, 10);
  const entries = await getEarningsCalendar(from, to, ticker);
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getWatchlistEarningsThisWeek(tickers) {
  const { from, to } = getWeekRange();
  const all = await getEarningsCalendar(from, to);
  const set = new Set(tickers.map((t) => t.toUpperCase()));
  return all
    .filter((e) => set.has(e.symbol))
    .sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export function buildEarningsLine(entry) {
  const eps = entry.epsEstimate != null ? `EPS est ${entry.epsEstimate}` : 'EPS TBD';
  const rev = entry.revenueEstimate != null ? `Rev est ${formatMoney(entry.revenueEstimate)}` : null;
  return `**${entry.symbol}** — ${entry.date} (${entry.hour}) • ${[eps, rev].filter(Boolean).join(' • ')}`;
}
