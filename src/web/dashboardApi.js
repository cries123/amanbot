import { config } from '../config.js';
import { scanTickerWicks } from '../services/smcScanner.js';
import { formatYahooError } from '../services/yahooMarket.js';
import {
  getQuote,
  estimateIvPercentile,
  getEconomicCalendar,
  filterHighImpactEvents,
  getWeekRange,
  fetchChartImage,
} from '../services/finnhub.js';
import { fetchTickerNews } from '../services/news.js';
import { formatEstTime } from '../utils/time.js';

function formatLevel(level, ticker, timeframe) {
  return {
    ticker,
    timeframe,
    structure: level.structure,
    setupType: level.setupType,
    zoneLow: level.zoneLow,
    zoneHigh: level.zoneHigh,
    touches: level.touches,
    spread: level.spread,
    formationTime: level.formationTime,
    formationTimeEst: level.formationTime ? formatEstTime(level.formationTime) : null,
    touchTimesEst: (level.touchTimes ?? []).map((t) => formatEstTime(t)),
  };
}

export async function getStatusPayload() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: config.timezone }));
  const day = et.getDay();
  const minutes = et.getHours() * 60 + et.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = isWeekday && minutes >= 9 * 60 + 30 && minutes <= 16 * 60;

  return {
    service: 'amanbot',
    status: 'ok',
    timeEt: et.toLocaleString('en-US', {
      timeZone: config.timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
    market: {
      open: isMarketHours,
      session: isWeekday ? (isMarketHours ? 'regular' : 'closed') : 'weekend',
    },
    features: {
      smcScanner: Boolean(config.channels.smcAlerts),
      ivMonitor: Boolean(config.apis.finnhub && config.channels.ivAlerts),
      economicCalendar: Boolean(config.apis.finnhub && config.channels.economic),
      tradingViewWebhooks: config.webhook.enabled,
      finnhub: Boolean(config.apis.finnhub),
    },
    smc: {
      tickers: config.monitors.smcTickers,
      timeframes: config.monitors.smcTimeframes,
      tolerance: config.monitors.eqhEqlTolerance,
    },
    ivWatchlist: config.monitors.ivWatchlist,
  };
}

export async function getSmcPayload(timeframe = '1h') {
  const results = [];

  for (const ticker of config.monitors.smcTickers) {
    try {
      const result = await scanTickerWicks(ticker, { timeframe, live: true });
      results.push({
        ticker: result.label,
        tradingDate: result.tradingDate,
        sessionBars: result.sessionBars,
        eqh: result.eqh.map((l) => formatLevel(l, result.label, timeframe)),
        eql: result.eql.map((l) => formatLevel(l, result.label, timeframe)),
      });
    } catch (err) {
      results.push({
        ticker,
        error: formatYahooError(err),
        eqh: [],
        eql: [],
      });
    }
  }

  return { timeframe, tolerance: config.monitors.eqhEqlTolerance, results };
}

export async function getQuotesPayload(tickers = null) {
  const symbols = tickers ?? [...new Set([...config.monitors.smcTickers, ...config.monitors.ivWatchlist.slice(0, 6)])];

  if (!config.apis.finnhub) {
    return { source: 'unavailable', quotes: symbols.map((s) => ({ ticker: s, error: 'Finnhub not configured' })) };
  }

  const quotes = await Promise.all(symbols.map(async (ticker) => {
    try {
      const q = await getQuote(ticker);
      const price = q.c ?? q.pc;
      const change = q.d ?? (q.c != null && q.pc != null ? q.c - q.pc : null);
      const changePct = q.dp ?? (change != null && q.pc ? (change / q.pc) * 100 : null);
      return {
        ticker,
        price,
        change,
        changePct,
        high: q.h,
        low: q.l,
        open: q.o,
        prevClose: q.pc,
      };
    } catch (err) {
      return { ticker, error: err.message };
    }
  }));

  return { source: 'finnhub', quotes };
}

export async function getIvPayload() {
  if (!config.apis.finnhub) {
    return { available: false, items: [] };
  }

  const items = await Promise.all(config.monitors.ivWatchlist.map(async (ticker) => {
    try {
      const result = await estimateIvPercentile(ticker);
      const pct = result.ivPercentile;
      let signal = 'neutral';
      if (pct != null && pct <= config.monitors.ivLowThreshold) signal = 'low';
      if (pct != null && pct >= config.monitors.ivHighThreshold) signal = 'high';

      return {
        ticker,
        ivPercentile: pct != null ? Math.round(pct * 10) / 10 : null,
        currentIv: result.currentIv != null ? Math.round(result.currentIv * 1000) / 10 : null,
        signal,
      };
    } catch (err) {
      return { ticker, error: err.message };
    }
  }));

  return {
    available: true,
    lowThreshold: config.monitors.ivLowThreshold,
    highThreshold: config.monitors.ivHighThreshold,
    items,
  };
}

export async function getCalendarPayload() {
  if (!config.apis.finnhub) {
    return { available: false, events: [] };
  }

  const { from, to } = getWeekRange();
  const events = filterHighImpactEvents(await getEconomicCalendar(from, to));
  return { available: true, from, to, events };
}

export async function getNewsPayload(ticker = 'SPY') {
  try {
    const result = await fetchTickerNews(ticker, 6);
    return { ticker: result.symbol, source: result.source, articles: result.articles };
  } catch (err) {
    return { ticker, error: err.message, articles: [] };
  }
}

export async function getChartBuffer(ticker, timeframe = '5m') {
  if (!config.apis.finnhub) {
    throw new Error('FINNHUB_API_KEY is not configured');
  }
  return fetchChartImage(ticker, timeframe);
}
