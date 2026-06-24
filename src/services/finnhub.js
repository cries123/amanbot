import axios from 'axios';
import { config } from '../config.js';

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

export async function getSpyDailyChange() {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date();
  from.setDate(from.getDate() - 5);
  const fromStr = from.toISOString().slice(0, 10);

  const { data } = await finnhubGet('/stock/candle', {
    symbol: 'SPY',
    resolution: 'D',
    from: Math.floor(new Date(fromStr).getTime() / 1000),
    to: Math.floor(Date.now() / 1000),
  });

  if (data.s !== 'ok' || !data.c?.length) {
    return null;
  }

  const last = data.c.length - 1;
  const change = data.c[last] - data.o[last];
  return change >= 0 ? 'bullish' : 'bearish';
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
